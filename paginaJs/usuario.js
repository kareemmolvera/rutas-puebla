// usuario.js
const coordenadasPuebla = [19.0414, -98.2063];
const mapa = L.map("mapa-usuario").setView(coordenadasPuebla, 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap - Proyecto Feria",
}).addTo(mapa);

const pueblaBounds = L.latLngBounds([18.9, -98.35], [19.15, -98.05]);

const buscador = L.Control.geocoder({
  defaultMarkGeocode: false,
  geocoder: L.Control.Geocoder.nominatim({
    geocodingQueryParams: {
      viewbox: "-98.3500,19.1500,-98.0500,18.9000",
      bounded: 1,
    },
  }),
}).addTo(mapa);

buscador.on("markgeocode", function (e) {
  const destinoCoordenadas = e.geocode.center;

  if (marcadorDestino !== null) {
    mapa.removeLayer(marcadorDestino);
  }

  marcadorDestino = L.marker(destinoCoordenadas)
    .addTo(mapa)
    .bindPopup(e.geocode.name)
    .openPopup();

  const latDestino = destinoCoordenadas.lat;
  const lngDestino = destinoCoordenadas.lng;

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
let miUbicacionActual = null;
let marcadorDestino = null;

let lineaRutaVisual = null;
let marcadorSubida = null;
let marcadorBajada = null;

if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(
    (posicion) => {
      const lat = posicion.coords.latitude;
      const lng = posicion.coords.longitude;
      miUbicacionActual = { lat, lng };

      if (marcadorGPS === null) {
        marcadorGPS = L.circleMarker([lat, lng], {
          color: "white",
          fillColor: "#007bff",
          fillOpacity: 1,
          radius: 8,
          weight: 2,
        }).addTo(mapa);

        mapa.setView([lat, lng], 16);
        marcadorGPS.bindPopup("<b>Estás aquí</b>").openPopup();
      } else {
        marcadorGPS.setLatLng([lat, lng]);
      }
    },
    (error) => {
      console.error("Error al obtener GPS:", error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
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

  const boton = document.querySelector("#panel-busqueda button");
  boton.innerText = "...";

  const urlBusqueda = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(inputDestino + ", Puebla, Mexico")}&limit=1`;

  try {
    const respuesta = await fetch(urlBusqueda);
    const datos = await respuesta.json();

    if (datos.length > 0) {
      const latDestino = parseFloat(datos[0].lat);
      const lngDestino = parseFloat(datos[0].lon);

      if (marcadorDestino !== null) {
        mapa.removeLayer(marcadorDestino);
      }
      marcadorDestino = L.marker([latDestino, lngDestino])
        .addTo(mapa)
        .bindPopup(`<b>Destino:</b> ${inputDestino}`)
        .openPopup();

      mapa.setView([latDestino, lngDestino], 15);

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
    boton.innerText = "Ir";
  }
}

async function buscarMejorRutaEnGo(latA, lngA, latB, lngB) {
  try {
    const data = await apiBuscarRuta(latA, lngA, latB, lngB);

    if (data.mensaje) {
      alert(data.mensaje);
    } else {
      const coordenadasCamino = JSON.parse(data.camino);

      if (lineaRutaVisual) mapa.removeLayer(lineaRutaVisual);
      if (marcadorSubida) mapa.removeLayer(marcadorSubida);
      if (marcadorBajada) mapa.removeLayer(marcadorBajada);

      lineaRutaVisual = L.polyline(coordenadasCamino, {
        color: "#ff5722",
        weight: 5,
      }).addTo(mapa);

      const puntoOrigen = coordenadasCamino[0];
      const puntoDestino = coordenadasCamino[coordenadasCamino.length - 1];

      marcadorSubida = L.circleMarker(puntoOrigen, {
        color: "white",
        fillColor: "#28a745",
        fillOpacity: 1,
        radius: 9,
        weight: 2,
      })
        .addTo(mapa)
        .bindPopup(`<b>🟢 Sube aquí:</b><br>${data.parada_origen_nombre}`);

      marcadorBajada = L.circleMarker(puntoDestino, {
        color: "white",
        fillColor: "#dc3545",
        fillOpacity: 1,
        radius: 9,
        weight: 2,
      })
        .addTo(mapa)
        .bindPopup(`<b>🔴 Baja aquí:</b><br>${data.parada_destino_nombre}`);

      document.getElementById("ruta-titulo").innerText =
        `¡Toma la ${data.nombre_ruta}!`;
      document.getElementById("ruta-subida").innerText =
        data.parada_origen_nombre;
      document.getElementById("ruta-bajada").innerText =
        data.parada_destino_nombre;
      document.getElementById("tarjeta-ruta").style.display = "block";
    }
  } catch (error) {
    console.error("Error al conectar con la API:", error);
    alert("Error de conexión con el servidor de rutas.");
  }
}
