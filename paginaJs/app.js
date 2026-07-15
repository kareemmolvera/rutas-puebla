const coordenadasPuebla = [19.0414, -98.2063];
const mapa = L.map("mapa").setView(coordenadasPuebla, 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap - Proyecto Feria",
}).addTo(mapa);

// --- VARIABLES DE CONTROL ---
let esModoTrazado = false;
let coordenadasTemporales = [];
let lineaTemporalVisual = null;

let esModoParada = false; // Variable para controlar el modo de clics de paradas

// --- CARGA INICIAL (GET) ---
function cargarRutasDesdeAPI() {
  fetch("http://localhost:8080/api/rutas")
    .then((res) => res.json())
    .then((rutas) => {
      const selectRutas = document.getElementById("ruta-parada");
      selectRutas.innerHTML = ""; // Limpiamos el texto de "Cargando..."

      rutas.forEach((ruta) => {
        // 1. Dibujamos la línea en el mapa
        let colorRuta = ruta.tipo === "linea" ? "#e6194B" : "#000075";
        const linea = L.polyline(ruta.coordenadas, {
          color: colorRuta,
          weight: 5,
          opacity: 0.7,
        }).addTo(mapa);
        linea.bindPopup(`<b>${ruta.nombre}</b> (${ruta.tipo})`);

        // 2. Llenamos el <select> del panel de paradas
        const option = document.createElement("option");
        option.value = ruta.id;
        option.text = ruta.nombre;
        selectRutas.appendChild(option);
      });
    })
    .catch((err) => console.error("Error al cargar rutas fijas:", err));
}

function cargarParadasDesdeAPI() {
  fetch("http://localhost:8080/api/paradas")
    .then((res) => res.json())
    .then((paradas) => {
      // Limpiamos marcadores viejos para evitar duplicados al recargar
      mapa.eachLayer((layer) => {
        if (layer instanceof L.Marker) mapa.removeLayer(layer);
      });

      // Colocamos el icono del marcador de Leaflet para cada parada
      paradas.forEach((p) => {
        L.marker([p.latitud, p.longitud])
          .addTo(mapa)
          .bindPopup(`<b>${p.nombre}</b>`);
      });
    })
    .catch((err) => console.error("Error al cargar paradas:", err));
}

// --- INTERFAZ (BOTONES) ---
function conmutarModoTrazado() {
  if (esModoParada) conmutarModoParada(); // Apaga el modo parada si estaba activo

  esModoTrazado = !esModoTrazado;
  const btn = document.getElementById("btn-trazar");
  const estado = document.getElementById("texto-estado");
  const btnGuardar = document.getElementById("btn-guardar");

  if (esModoTrazado) {
    btn.innerText = "Pausar Trazado";
    btn.style.background = "#ffc107";
    btn.style.color = "#000";
    estado.innerText = "Modo Trazado Activo: Haz clics para dibujar";
    estado.style.display = "block";
    btnGuardar.disabled = false;
  } else {
    btn.innerText = "Iniciar Trazado";
    btn.style.background = "#007bff";
    btn.style.color = "white";
    estado.style.display = "none";
  }
}

function conmutarModoParada() {
  if (esModoTrazado) conmutarModoTrazado(); // Apaga el modo trazado si estaba activo

  esModoParada = !esModoParada;
  const btn = document.getElementById("btn-modo-parada");
  const estado = document.getElementById("texto-estado");

  if (esModoParada) {
    btn.innerText = "Cancelar Parada";
    btn.style.background = "#dc3545";
    estado.innerText = "Modo Parada Activo: Haz clic en el mapa para guardarla";
    estado.style.display = "block";
  } else {
    btn.innerText = "Modo Colocar Parada";
    btn.style.background = "#28a745";
    estado.style.display = "none";
  }
}

// --- EVENTOS DEL MAPA (CLICS) ---
// Usamos 'async' porque ahora nos comunicaremos con un servidor externo en tiempo real
// --- EVENTOS DEL MAPA (CLICS) ---
mapa.on("click", async function (evento) {
  if (!esModoTrazado && !esModoParada) return;

  const lat = evento.latlng.lat;
  const lng = evento.latlng.lng;

  // Si está trazando una ruta...
  if (esModoTrazado) {
    // 1. Guardamos la coordenada exacta del clic
    coordenadasTemporales.push([lat, lng]);

    if (coordenadasTemporales.length === 1) {
      // 2. Es el primer clic: preparamos la línea visual punteada
      lineaTemporalVisual = L.polyline(coordenadasTemporales, {
        color: "#ff5722",
        weight: 4,
        dashArray: "5, 10",
      }).addTo(mapa);
    } else {
      // 3. Siguientes clics: Leaflet une los puntos exactamente donde diste clic
      lineaTemporalVisual.setLatLngs(coordenadasTemporales);
    }
  }
  // Si está colocando una parada...
  else if (esModoParada) {
    guardarParadaFisica(lat, lng);
  }
});

// --- GUARDAR DATOS (POST) ---
function guardarRuta() {
  const nombreInput = document.getElementById("nombre").value.trim();
  const tipoInput = document.getElementById("tipo").value;

  if (nombreInput === "" || coordenadasTemporales.length < 2) {
    alert("Faltan datos o puntos en el mapa.");
    return;
  }

  const datosRuta = {
    nombre: nombreInput,
    tipo: tipoInput,
    coordenadas: coordenadasTemporales,
  };

  fetch("http://localhost:8080/api/rutas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datosRuta),
  })
    .then((res) => res.json())
    .then((data) => {
      alert("¡Ruta guardada exitosamente en la base de datos!");

      limpiarTrazadoActual();
      conmutarModoTrazado();
      document.getElementById("nombre").value = "";

      mapa.eachLayer((layer) => {
        if (layer instanceof L.Polyline) mapa.removeLayer(layer);
      });
      cargarRutasDesdeAPI();
    })
    .catch((err) => {
      alert("Error al conectar con el backend de Go");
      console.error(err);
    });
}

function guardarParadaFisica(lat, lng) {
  const nombreInput = document.getElementById("nombre-parada").value.trim();
  const rutaIdInput = document.getElementById("ruta-parada").value;

  if (nombreInput === "") {
    alert("Escribe el nombre de la parada antes de hacer clic en el mapa.");
    return;
  }
  if (rutaIdInput === "") {
    alert("Debes crear al menos una ruta primero.");
    return;
  }

  const datosParada = {
    ruta_id: parseInt(rutaIdInput),
    nombre: nombreInput,
    latitud: lat,
    longitud: lng,
  };

  fetch("http://localhost:8080/api/paradas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datosParada),
  })
    .then((res) => res.json())
    .then((data) => {
      alert(`¡Parada "${nombreInput}" guardada con éxito!`);
      document.getElementById("nombre-parada").value = ""; // Limpiamos el input
      conmutarModoParada(); // Apagamos el modo parada
      cargarParadasDesdeAPI(); // Refrescamos los iconos
    })
    .catch((err) => {
      alert("Error al guardar la parada en Go");
      console.error(err);
    });
}

// Limpia el progreso actual de clics sin guardar
function limpiarTrazadoActual() {
  coordenadasTemporales = [];
  if (lineaTemporalVisual !== null) {
    mapa.removeLayer(lineaTemporalVisual);
    lineaTemporalVisual = null;
  }
}

// Carga inicial al abrir la página
cargarRutasDesdeAPI();
cargarParadasDesdeAPI();
