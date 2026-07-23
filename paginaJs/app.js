// app.js - Versión Azure Maps

// 1. INICIALIZAR EL MAPA
// Nota: Azure Maps usa [Longitud, Latitud] para centrar el mapa
const mapa = new atlas.Map("mapa", {
    center: [-98.2063, 19.0414], // Coordenadas de Puebla invertidas para Azure
    zoom: 14,
    authOptions: {
        authType: 'subscriptionKey',
        subscriptionKey: '8Q3AVe2gCxB3xk0Ga3U3y1LvqjpTe6Fk9zui4KIfEpv9UWUJvGddJQQJ99CGACYeBjFjleVwAAAgAZMP4FKk' // <-- ¡PON TU CLAVE DE AZURE AQUÍ!
    }
});

let esModoTrazado = false;
let coordenadasTemporales = []; // Seguirá guardando [lat, lng] para mandarlo a la BD en Go
let esModoParada = false;

// Variables para manejar los datos y las capas en Azure
let dataSourceRutas, dataSourceParadas, dataSourceTrazado;
let popupGlobal;

// 2. CONFIGURAR CAPAS (Esperar a que el mapa cargue)
mapa.events.add('ready', function () {
    
    // --- Capa para Rutas Guardadas ---
    dataSourceRutas = new atlas.source.DataSource();
    mapa.sources.add(dataSourceRutas);
    mapa.layers.add(new atlas.layer.LineLayer(dataSourceRutas, null, {
        strokeColor: ['get', 'color'],
        strokeWidth: 5,
        strokeOpacity: 0.7
    }));

    // --- Capa para Paradas Guardadas ---
    dataSourceParadas = new atlas.source.DataSource();
    mapa.sources.add(dataSourceParadas);
    mapa.layers.add(new atlas.layer.SymbolLayer(dataSourceParadas, null, {
        iconOptions: {
            image: 'pin-blue',
            allowOverlap: true
        }
    }));

    // --- Capa para el Trazado en Vivo ---
    dataSourceTrazado = new atlas.source.DataSource();
    mapa.sources.add(dataSourceTrazado);
    mapa.layers.add(new atlas.layer.LineLayer(dataSourceTrazado, null, {
        strokeColor: "#ff5722",
        strokeWidth: 4,
        strokeDashArray: [2, 2] 
    }));

    // --- Sistema de Popups ---
    popupGlobal = new atlas.Popup({
        pixelOffset: [0, -18],
        closeButton: false
    });

    // Mostrar Popups al pasar el mouse sobre rutas o paradas
    mapa.events.add('mouseover', [dataSourceRutas, dataSourceParadas], function (e) {
        if (e.shapes && e.shapes.length > 0) {
            let properties = e.shapes[0].getProperties();
            let position = mapa.camera.getCameraState().center; 
            
            if(e.shapes[0].getType() === 'Point') {
                position = e.shapes[0].getCoordinates();
            }
            
            popupGlobal.setOptions({
                content: `<div style="padding:10px; font-family:sans-serif;"><b>${properties.nombre}</b> ${properties.tipo ? `(${properties.tipo})` : ''}</div>`,
                position: position
            });
            popupGlobal.open(mapa);
        }
    });

    mapa.events.add('mouseout', [dataSourceRutas, dataSourceParadas], function () {
        popupGlobal.close();
    });

    // --- Evento de Clics en el Mapa ---
    mapa.events.add('click', function (evento) {
        if (!esModoTrazado && !esModoParada) return;

        // Azure devuelve la posición como [Lng, Lat]
        const lng = evento.position[0];
        const lat = evento.position[1];

        if (esModoTrazado) {
            // Guardamos para el backend en formato [lat, lng]
            coordenadasTemporales.push([lat, lng]); 

            // Convertimos para pintar en Azure Maps en formato [lng, lat]
            let coordenadasAzure = coordenadasTemporales.map(coord => [coord[1], coord[0]]);
            
            dataSourceTrazado.clear();
            if (coordenadasAzure.length > 1) {
                dataSourceTrazado.add(new atlas.data.Feature(new atlas.data.LineString(coordenadasAzure)));
            }
        } else if (esModoParada) {
            guardarParadaFisica(lat, lng);
        }
    });

    // Una vez configurado el mapa, pedimos los datos a Go
    cargarRutasDesdeAPI();
    cargarParadasDesdeAPI();
});

// --- FUNCIONES DE COMUNICACIÓN CON LA API ---
function cargarRutasDesdeAPI() {
    apiObtenerRutas()
        .then((rutas) => {
            const selectRutas = document.getElementById("ruta-parada");
            selectRutas.innerHTML = "";
            
            if (dataSourceRutas) dataSourceRutas.clear();

            rutas.forEach((ruta) => {
                let colorRuta = ruta.tipo === "linea" ? "#e6194B" : "#000075";
                
                // Convertimos el arreglo que manda Go [lat, lng] a [lng, lat]
                let coordsAzure = ruta.coordenadas.map(c => [c[1], c[0]]);
                
                if (dataSourceRutas && coordsAzure.length > 1) {
                    let feature = new atlas.data.Feature(new atlas.data.LineString(coordsAzure), {
                        nombre: ruta.nombre,
                        tipo: ruta.tipo,
                        color: colorRuta
                    });
                    dataSourceRutas.add(feature);
                }

                const option = document.createElement("option");
                option.value = ruta.id;
                option.text = ruta.nombre;
                selectRutas.appendChild(option);
            });
        })
        .catch((err) => console.error("Error al cargar rutas fijas:", err));
}

function cargarParadasDesdeAPI() {
    apiObtenerParadas()
        .then((paradas) => {
            if (dataSourceParadas) dataSourceParadas.clear();

            paradas.forEach((p) => {
                if (dataSourceParadas) {
                    let point = new atlas.data.Feature(new atlas.data.Point([p.longitud, p.latitud]), {
                        nombre: p.nombre
                    });
                    dataSourceParadas.add(point);
                }
            });
        })
        .catch((err) => console.error("Error al cargar paradas:", err));
}

// --- INTERFAZ DE BOTONES (Sin cambios de lógica) ---
function conmutarModoTrazado() {
    if (esModoParada) conmutarModoParada();

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
    if (esModoTrazado) conmutarModoTrazado();

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
        coordenadas: coordenadasTemporales, // Se envía a Go exactamente como antes [lat, lng]
    };

    apiGuardarRuta(datosRuta)
        .then((data) => {
            alert("¡Ruta guardada exitosamente en la base de datos!");
            limpiarTrazadoActual();
            conmutarModoTrazado();
            document.getElementById("nombre").value = "";
            cargarRutasDesdeAPI();
        })
        .catch((err) => {
            alert("Error al conectar con el backend");
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

    apiGuardarParada(datosParada)
        .then((data) => {
            alert(`¡Parada "${nombreInput}" guardada con éxito!`);
            document.getElementById("nombre-parada").value = "";
            conmutarModoParada();
            cargarParadasDesdeAPI();
        })
        .catch((err) => {
            alert("Error al guardar la parada");
            console.error(err);
        });
}

function limpiarTrazadoActual() {
    coordenadasTemporales = [];
    if (dataSourceTrazado) {
        dataSourceTrazado.clear();
    }
}