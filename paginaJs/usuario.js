const coordenadasPuebla = [19.0414, -98.2063];
const mapa = L.map("mapa-usuario").setView(coordenadasPuebla, 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap - Proyecto Feria",
}).addTo(mapa);

// 1. Configurar los límites geográficos para Puebla (Bounding Box)
const pueblaBounds = L.latLngBounds(
  [18.9, -98.35], // Suroeste de Puebla
  [19.15, -98.05], // Noreste de Puebla
);

// 2. Agregar el buscador inteligente al mapa
const buscador = L.Control.geocoder({
  defaultMarkGeocode: false,
  geocoder: L.Control.Geocoder.nominatim({
    geocodingQueryParams: {
      viewbox: "-98.3500,19.1500,-98.0500,18.9000",
      bounded: 1,
    },
  }),
}).addTo(mapa); // <-- Anclado a tu variable "mapa"

// 3. Qué hacer cuando el usuario elige una sugerencia de la lista
buscador.on("markgeocode", function (e) {
  const destinoCoordenadas = e.geocode.center;

  // Si ya existe un marcador anterior, lo borramos
  if (marcadorDestino !== null) {
    mapa.removeLayer(marcadorDestino);
  }

  // Ponemos el marcador visual en el destino elegido
  marcadorDestino = L.marker(destinoCoordenadas)
    .addTo(mapa)
    .bindPopup(e.geocode.name)
    .openPopup();

  // Extraemos las coordenadas
  const latDestino = destinoCoordenadas.lat;
  const lngDestino = destinoCoordenadas.lng;

  console.log("Destino seleccionado:", latDestino, lngDestino);

  // Enviamos los datos directo a Go si ya tenemos el GPS del usuario
  if (miUbicacionActual) {
    buscarMejorRutaEnGo(
      miUbicacionActual.lat,
      miUbicacionActual.lng,
      latDestino,
      lngDestino,
    );
  } else {
    alert("Esperando a obtener tu ubicación GPS actual...");
  }
});

let marcadorGPS = null;
let miUbicacionActual = null; // Guardaremos aquí lat y lng del pasajero
let marcadorDestino = null; // Definimos como borrar y agregar una nueva direccion

//Borrar marcadores al realizar una segunda busqueda
let lineaRutaVisual = null;
let marcadorSubida = null;
let marcadorBajada = null;

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

async function buscarMejorRutaEnGo(latA, lngA, latB, lngB) {
  try {
    //esta mal de momento :(
    const respuesta = await fetch(
      "https://affected-bagpipe-implosion.ngrok-free.dev/api/buscar-ruta",
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
      // Convertimos el string de la base de datos (JSON) a un arreglo de coordenadas real
      const coordenadasCamino = JSON.parse(data.camino);

      // 1. Limpiar la ruta y paradas de la búsqueda anterior (si existen)
      if (lineaRutaVisual) mapa.removeLayer(lineaRutaVisual);
      if (marcadorSubida) mapa.removeLayer(marcadorSubida);
      if (marcadorBajada) mapa.removeLayer(marcadorBajada);

      // 2. Dibujamos la nueva línea de la ruta
      lineaRutaVisual = L.polyline(coordenadasCamino, {
        color: "#ff5722",
        weight: 5,
      }).addTo(mapa);

      // 3. Extraemos el primer y último punto del trayecto
      const puntoOrigen = coordenadasCamino[0];
      const puntoDestino = coordenadasCamino[coordenadasCamino.length - 1];

      // 4. Usamos circleMarker (Vectores SVG) para garantizar que siempre se vean
      marcadorSubida = L.circleMarker(puntoOrigen, {
        color: "white",
        fillColor: "#28a745", // Verde para subir
        fillOpacity: 1,
        radius: 9,
        weight: 2,
      })
        .addTo(mapa)
        .bindPopup(`<b>🟢 Sube aquí:</b><br>${data.parada_origen_nombre}`);

      marcadorBajada = L.circleMarker(puntoDestino, {
        color: "white",
        fillColor: "#dc3545", // Rojo para bajar
        fillOpacity: 1,
        radius: 9,
        weight: 2,
      })
        .addTo(mapa)
        .bindPopup(`<b>🔴 Baja aquí:</b><br>${data.parada_destino_nombre}`);

      // 5. Inyectamos los datos en la tarjeta HTML y la mostramos
      document.getElementById("ruta-titulo").innerText =
        `¡Toma la ${data.nombre_ruta}!`;
      document.getElementById("ruta-subida").innerText =
        data.parada_origen_nombre;
      document.getElementById("ruta-bajada").innerText =
        data.parada_destino_nombre;
      document.getElementById("tarjeta-ruta").style.display = "block";
    }
  } catch (error) {
    console.error("Error al conectar con Go:", error);
    alert("Error de conexión con el servidor de rutas.");
  }
}
