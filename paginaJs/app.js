// app.js - Versión Azure Maps con Muchos a Muchos

// 1. INICIALIZAR EL MAPA
const mapa = new atlas.Map("mapa", {
    center: [-98.2063, 19.0414], 
    zoom: 14,
    authOptions: {
        authType: 'subscriptionKey',
        subscriptionKey: '8Q3AVe2gCxB3xk0Ga3U3y1LvqjpTe6Fk9zui4KIfEpv9UWUJvGddJQQJ99CGACYeBjFjleVwAAAgAZMP4FKk' 
    }
});

let esModoTrazado = false;
let coordenadasTemporales = []; 
let esModoParada = false;

// 🛑 NUEVO: Variable para llevar la cuenta del orden de las paradas
let ordenActualParada = 0; 

let dataSourceRutas, dataSourceParadas, dataSourceTrazado;
let popupGlobal;

// 2. CONFIGURAR CAPAS
mapa.events.add('ready', function () {
    
    dataSourceRutas = new atlas.source.DataSource();
    mapa.sources.add(dataSourceRutas);
    mapa.layers.add(new atlas.layer.LineLayer(dataSourceRutas, null, {
        strokeColor: ['get', 'color'],
        strokeWidth: 5,
        strokeOpacity: 0.7
    }));

    dataSourceParadas = new atlas.source.DataSource();
    mapa.sources.add(dataSourceParadas);
    mapa.layers.add(new atlas.layer.SymbolLayer(dataSourceParadas, null, {
        iconOptions: {
            image: 'pin-blue',
            allowOverlap: true
        }
    }));

    dataSourceTrazado = new atlas.source.DataSource();
    mapa.sources.add(dataSourceTrazado);
    mapa.layers.add(new atlas.layer.LineLayer(dataSourceTrazado, null, {
        strokeColor: "#ff5722",
        strokeWidth: 4,
        strokeDashArray: [2, 2] 
    }));

    popupGlobal = new atlas.Popup({
        pixelOffset: [0, -18],
        closeButton: false
    });

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

    // 🛑 MAGIA APLICADA AQUÍ: Detector de reciclaje de paradas
    mapa.events.add('click', function (evento) {
        if (!esModoTrazado && !esModoParada) return;

        let lat = evento.position[1];
        let lng = evento.position[0];
        
        let paradaIdExistente = 0;
        let nombreParadaExistente = "";

        // ¿El usuario le dio clic a un pin que ya existía?
        if (evento.shapes && evento.shapes.length > 0) {
            let shapeParada = evento.shapes.find(s => s.getType() === 'Point' && s.getProperties().id_parada);
            if (shapeParada) {
                paradaIdExistente = shapeParada.getProperties().id_parada;
                nombreParadaExistente = shapeParada.getProperties().nombre;
                // Ajustamos la coordenada EXACTA del pin viejo
                lng = shapeParada.getCoordinates()[0];
                lat = shapeParada.getCoordinates()[1];
            }
        }

        if (esModoTrazado) {
            coordenadasTemporales.push([lat, lng]); 
            let coordenadasAzure = coordenadasTemporales.map(coord => [coord[1], coord[0]]);
            
            dataSourceTrazado.clear();
            if (coordenadasAzure.length > 1) {
                dataSourceTrazado.add(new atlas.data.Feature(new atlas.data.LineString(coordenadasAzure)));
            }
        } else if (esModoParada) {
            guardarParadaFisica(lat, lng, paradaIdExistente, nombreParadaExistente);
        }
    });

    cargarRutasDesdeAPI();
    cargarParadasDesdeAPI();
});

// Resetear el contador de orden si el usuario cambia de ruta en el selector
document.getElementById("ruta-parada").addEventListener('change', function() {
    ordenActualParada = 0; 
});

function cargarRutasDesdeAPI() {
    apiObtenerRutas()
        .then((rutas) => {
            const selectRutas = document.getElementById("ruta-parada");
            selectRutas.innerHTML = `<option value="">Selecciona una ruta...</option>`; // Opción por defecto
            
            if (dataSourceRutas) dataSourceRutas.clear();

            rutas.forEach((ruta) => {
                let colorRuta = ruta.tipo === "linea" ? "#e6194B" : "#000075";
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
                        nombre: p.nombre,
                        id_parada: p.id // 🛑 Guardamos el ID oculto en el mapa para poder reciclarlo
                    });
                    dataSourceParadas.add(point);
                }
            });
        })
        .catch((err) => console.error("Error al cargar paradas:", err));
}

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
        
        // Si no han seleccionado ruta, avisar
        if(document.getElementById("ruta-parada").value === "") {
            alert("⚠️ Selecciona a qué ruta le vas a asignar paradas en el menú de la derecha.");
        }
    } else {
        btn.innerText = "Modo Colocar Parada";
        btn.style.background = "#28a745";
        estado.style.display = "none";
    }
}

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

// 🛑 NUEVO: Función de guardado inteligente (Nuevas o Recicladas)
function guardarParadaFisica(lat, lng, paradaIdExistente, nombreParadaExistente) {
    let nombreInput = document.getElementById("nombre-parada").value.trim();
    const rutaIdInput = document.getElementById("ruta-parada").value;

    if (rutaIdInput === "") {
        alert("Debes seleccionar una ruta en el menú de la derecha primero.");
        return;
    }

    // Lógica de reciclaje
    if (paradaIdExistente !== 0) {
        nombreInput = nombreParadaExistente; // Usamos el nombre que ya tenía en la BD
        const confirmar = confirm(`¿Quieres vincular la parada ya existente "${nombreInput}" a esta ruta?`);
        if (!confirmar) return;
    } else {
        if (nombreInput === "") {
            alert("Escribe el nombre de la nueva parada antes de hacer clic en el mapa.");
            return;
        }
    }

    const datosParada = {
        ruta_id: parseInt(rutaIdInput),
        parada_id: paradaIdExistente, // Va 0 si es calle vacía, o el ID real si tocaste un pin
        nombre: nombreInput,
        latitud: lat,
        longitud: lng,
        orden: ordenActualParada // Le decimos a Go el orden de esta parada
    };

    apiGuardarParada(datosParada)
        .then((data) => {
            alert(`¡Parada "${nombreInput}" vinculada exitosamente! (Orden en la ruta: ${ordenActualParada})`);
            document.getElementById("nombre-parada").value = "";
            ordenActualParada++; // Sumamos 1 para el siguiente clic
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