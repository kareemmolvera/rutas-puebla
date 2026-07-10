const coordenadasPuebla = [19.0414, -98.2063];
const mapa = L.map("mapa-usuario").setView(coordenadasPuebla, 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap - Proyecto Feria",
}).addTo(mapa);

let marcadorGPS = null;
let miUbicacionActual = null; // Guardaremos aquí lat y lng del pasajero
let marcadorDestino = null; // Definimos como borrar y agregar una nueva direccion

// --- INICIAR RASTREO GPS ---
// Comprobamos si el navegador tiene soporte para ubicación
if ("geolocation" in navigator) {
  // watchPosition se queda "escuchando". Si caminas, se actualiza solo.
  navigator.geolocation.watchPosition(
    (posicion) => {
      const lat = posicion.coords.latitude;
      const lng = posicion.coords.longitude;
      miUbicacionActual = { lat, lng };

      // Si es la primera vez que detecta la ubicación, crea el marcador
      if (marcadorGPS === null) {
        // Hacemos un marcador personalizado (puedes imaginar que es un punto azul)
        marcadorGPS = L.circleMarker([lat, lng], {
          color: "white",
          fillColor: "#007bff", // Azul estilo Google Maps
          fillOpacity: 1,
          radius: 8,
          weight: 2,
        }).addTo(mapa);

        // Centramos el mapa en el usuario con un zoom más cercano
        mapa.setView([lat, lng], 16);
        marcadorGPS.bindPopup("<b>Estás aquí</b>").openPopup();
      } else {
        // Si ya existe y el usuario caminó, solo movemos el marcador sin recargar el mapa
        marcadorGPS.setLatLng([lat, lng]);
      }
    },
    (error) => {
      console.error("Error al obtener GPS:", error.message);
    },
    {
      enableHighAccuracy: true, // Pide la máxima precisión posible al dispositivo
      maximumAge: 0, // No usar caché viejo
    },
  );
} else {
  alert("Tu navegador no soporta geolocalización.");
}

async function buscarDestino() {
  const inputDestino = document.getElementById("destino").value;

  if (inputDestino.trim() === "") {
    alert("Por favor, escribe un destino.");
    return;
  }

  // Cambiamos el texto del botón para que el usuario sepa que está cargando
  const boton = document.querySelector("#panel-busqueda button");
  boton.innerText = "...";

  // Llamamos a Nominatim (le agregamos Puebla para mayor precisión)
  const urlBusqueda = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(inputDestino + ", Puebla, Mexico")}&limit=1`;

  try {
    const respuesta = await fetch(urlBusqueda);
    const datos = await respuesta.json();

    if (datos.length > 0) {
      const latDestino = parseFloat(datos[0].lat);
      const lngDestino = parseFloat(datos[0].lon);

      // Si ya existe un marcador anterior, lo borramos del mapa
      if (marcadorDestino !== null) {
        mapa.removeLayer(marcadorDestino);
      }
      // Colocamos el marcador nuevo y lo guardamos en nuestra variable
      marcadorDestino = L.marker([latDestino, lngDestino])
        .addTo(mapa)
        .bindPopup(`<b>Destino:</b> ${inputDestino}`)
        .openPopup();

      // Centramos el mapa para ver el destino
      mapa.setView([latDestino, lngDestino], 15);

      // --- PRÓXIMO PASO: AQUÍ CONECTAREMOS CON TU BACKEND EN GO ---
      console.log("Coordenada A (Usuario):", miUbicacionActual);
      console.log("Coordenada B (Destino):", {
        lat: latDestino,
        lng: lngDestino,
      });
      buscarMejorRutaEnGo(
        miUbicacionActual.lat,
        miUbicacionActual.lng,
        latDestino,
        lngDestino,
      );
    } else {
      alert("No se encontró el lugar. Intenta usar un nombre más conocido.");
    }
  } catch (error) {
    console.error("Error al buscar:", error);
    alert("Error de conexión al buscar el destino.");
  } finally {
    boton.innerText = "Ir"; // Restauramos el botón
  }
}
//https://d370023cc41a1f.lhr.life
//https://f998077f2f63be.lhr.life
async function buscarMejorRutaEnGo(latA, lngA, latB, lngB) {
  try {
    //esta mal de momento :(
    const respuesta = await fetch(
      "https://e4a6be88a3bc0f.lhr.life/api/buscar-ruta",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lat_origen: latA,
          lng_origen: lngA,
          lat_destino: latB,
          lng_destino: lngB,
        }),
      },
    );

    const data = await respuesta.json();

    if (data.mensaje) {
      // Si Go nos manda un mensaje de error (no hay rutas cerca)
      alert(data.mensaje);
    } else {
      // ¡Éxito! Go encontró la ruta
      alert(
        `¡Toma la ruta: ${data.nombre_ruta}! \nSube en: ${data.parada_origen_nombre} \nBaja en: ${data.parada_destino_nombre}`,
      );

      // Convertimos el string de la base de datos (JSON) a un arreglo de coordenadas real
      const coordenadasCamino = JSON.parse(data.camino);

      // Dibujamos la línea de la ruta en el mapa del usuario
      L.polyline(coordenadasCamino, {
        color: "#ff5722",
        weight: 5,
      }).addTo(mapa);
    }
  } catch (error) {
    console.error("Error al conectar con Go:", error);
    alert("Error de conexión con el servidor de rutas.");
  }
}
