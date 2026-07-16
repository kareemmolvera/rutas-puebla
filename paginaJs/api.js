// api.js
const API_URL = "/api";

async function apiObtenerRutas() {
  const res = await fetch(`${API_URL}/rutas`);
  return res.json();
}

async function apiObtenerParadas() {
  const res = await fetch(`${API_URL}/paradas`);
  return res.json();
}

async function apiGuardarRuta(datosRuta) {
  const res = await fetch(`${API_URL}/rutas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datosRuta),
  });
  return res.json();
}

async function apiGuardarParada(datosParada) {
  const res = await fetch(`${API_URL}/paradas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datosParada),
  });
  return res.json();
}

async function apiBuscarRuta(latA, lngA, latB, lngB) {
  const res = await fetch(`${API_URL}/buscar-ruta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lat_origen: latA,
      lng_origen: lngA,
      lat_destino: latB,
      lng_destino: lngB,
    }),
  });
  return res.json();
}
