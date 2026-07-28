
// usuario.js - Versión Azure Maps con Autocompletado

const AZURE_MAPS_KEY = '8Q3AVe2gCxB3xk0Ga3U3y1LvqjpTe6Fk9zui4KIfEpv9UWUJvGddJQQJ99CGACYeBjFjleVwAAAgAZMP4FKk'; // <-- Asegúrate de que esté pegada aquí

// 1. Inyectar la barra de búsqueda con DATALIST (Autocompletado nativo)
document.addEventListener("DOMContentLoaded", () => {
    let panel = document.getElementById("panel-busqueda");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "panel-busqueda";
        document.body.appendChild(panel);
    }
    panel.innerHTML = `
        <input type="text" id="destino" list="sugerencias-azure" placeholder="¿A dónde vas? (Ej. Zócalo, BUAP)" oninput="buscarSugerencias(this.value)">
        <datalist id="sugerencias-azure"></datalist>
        <button onclick="buscarDestino()">Ir</button>
    `;
});


// NUEVA FUNCIÓN: Autocompletado mientras escribes
let timeoutBusqueda;
async function buscarSugerencias(texto) {
    if (texto.trim().length < 3) return; // Empezar a buscar después de 3 letras

    clearTimeout(timeoutBusqueda); // Evitar saturar la API con cada tecla

    timeoutBusqueda = setTimeout(async () => {
        const urlSugerencias = `https://atlas.microsoft.com/search/fuzzy/json?api-version=1.0&query=${encodeURIComponent(texto + ", Puebla")}&subscription-key=${AZURE_MAPS_KEY}&limit=5`;

        try {
            const respuesta = await fetch(urlSugerencias);
            const datos = await respuesta.json();
            const datalist = document.getElementById("sugerencias-azure");
            datalist.innerHTML = ""; // Limpiar sugerencias anteriores

            if (datos.results) {
                datos.results.forEach(resultado => {
                    const option = document.createElement("option");
                    // Si es un lugar de interés (POI) usa su nombre, si no, usa la calle
                    let nombreLugar = resultado.poi ? resultado.poi.name : resultado.address.freeformAddress;
                    option.value = nombreLugar;
                    datalist.appendChild(option);
                });
            }
        } catch (error) {
            console.error("Error cargando sugerencias:", error);
        }
    }, 200); // Espera 300ms después de que dejas de escribir
}


// 2. Inicializar mapa de Azure
const mapa = new atlas.Map("mapa-usuario", {
    center: [-98.2063, 19.0414], // [Longitud, Latitud]
    zoom: 14,
    authOptions: {
        authType: 'subscriptionKey',
        subscriptionKey: AZURE_MAPS_KEY
    }
});

// Variables globales para fuentes de datos
let dsGPS, dsDestino, dsRuta, dsParadas, dsPOIs;
let miUbicacionActual = null;
let primeraVezGPS = true;

mapa.events.add('ready', function () {
    // Capa 1: Ubicación en vivo del usuario
    dsGPS = new atlas.source.DataSource();
    mapa.sources.add(dsGPS);
    mapa.layers.add(new atlas.layer.SymbolLayer(dsGPS, null, {
        iconOptions: { image: 'pin-blue' }
    }));

    // Capa 2: Punto de destino buscado
    dsDestino = new atlas.source.DataSource();
    mapa.sources.add(dsDestino);
    mapa.layers.add(new atlas.layer.SymbolLayer(dsDestino, null, {
        iconOptions: { image: 'pin-red' }
    }));

    // Capa 3: Línea de la ruta del camión
    dsRuta = new atlas.source.DataSource();
    mapa.sources.add(dsRuta);
    mapa.layers.add(new atlas.layer.LineLayer(dsRuta, null, {
        strokeColor: "#ff5722",
        strokeWidth: 5
    }));

    // Capa 4: Puntos de Subida y Bajada recomendados
    dsParadas = new atlas.source.DataSource();
    mapa.sources.add(dsParadas);
    mapa.layers.add(new atlas.layer.SymbolLayer(dsParadas, null, {
        iconOptions: { image: 'pin-round-darkblue' },
        textOptions: {
            textField: ['get', 'title'],
            offset: [0, 1.2],
            color: '#000000',
            size: 14
        }
    }));

    // Capa 5: Puntos de referencia (Tiendas, parques, etc.)
    dsPOIs = new atlas.source.DataSource();
    mapa.sources.add(dsPOIs);
    mapa.layers.add(new atlas.layer.SymbolLayer(dsPOIs, null, {
        iconOptions: {
            image: 'marker-blue', // Un icono más pequeño para no estorbar
            size: 0.6
        },
        textOptions: {
            textField: ['get', 'name'], // Muestra el nombre del lugar (ej. "Oxxo")
            offset: [0, 1.2],
            size: 11,
            color: '#444444' // Gris oscuro para que no compita con los pines principales
        }
    }));

    // Iniciar rastreo GPS tan pronto cargue el mapa
    iniciarRastreoGPS();

    //Capa Controles Dentro del mapa
    // --- CONTROLES DE INTERFAZ PREMIUM (Con Tráfico) ---
    mapa.controls.add([
        new atlas.control.ZoomControl(),
        new atlas.control.CompassControl(),
        new atlas.control.PitchControl(),
        new atlas.control.StyleControl({
            mapStyles: ['road', 'road_shaded_relief', 'satellite_road_labels', 'night']
        }),
        // ¡Este es el nuevo botón mágico!
        new atlas.control.TrafficControl({
            incidents: true // Activa los iconos de choques y obras
        })
    ], {
        position: 'bottom-right'
    });
});

// --- RASTREO GPS ---
function iniciarRastreoGPS() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(
            (posicion) => {
                const lat = posicion.coords.latitude;
                const lng = posicion.coords.longitude;
                miUbicacionActual = { lat, lng };

                // Borramos el marcador anterior si el usuario se mueve
                                if (window.marcadorUsuario) {
                                    mapa.markers.remove(window.marcadorUsuario);
                                }

                                // 🛑 Marcador minimalista (Punto Azul centrado)
                                                window.marcadorUsuario = new atlas.HtmlMarker({
                                                    htmlContent: '<div class="marcador-gps-usuario"></div>',
                                                    position: [lng, lat],
                                                    pixelOffset: [0, 0] // 0,0 para que el centro del círculo sea tu ubicación exacta
                                                });

                                mapa.markers.add(window.marcadorUsuario);

                // Centrar la cámara en el usuario solo la primera vez que detecta señal
                if (primeraVezGPS) {
                    mapa.setCamera({ center: [lng, lat], zoom: 15 });

                    cargarLugaresDeReferencia(lat, lng);

                    primeraVezGPS = false;
                }
            },
            (error) => {
                console.error("Error al obtener GPS:", error.message);
            },
            { enableHighAccuracy: true, maximumAge: 0 }
        );
    } else {
        alert("Tu navegador no soporta geolocalización.");
    }
}

// --- BUSCADOR CON LA IA DE AZURE MAPS ---
async function buscarDestino() {
    const inputDestino = document.getElementById("destino").value;

    if (inputDestino.trim() === "") {
        alert("Por favor, escribe un destino.");
        return;
    }

    const boton = document.querySelector("#panel-busqueda button");
    boton.innerText = "...";

        // Usamos search/fuzzy/json en lugar de search/address/json
const urlBusqueda = `https://atlas.microsoft.com/search/fuzzy/json?api-version=1.0&query=${encodeURIComponent(inputDestino + ", Puebla, Mexico")}&subscription-key=${AZURE_MAPS_KEY}&limit=1`;


    try {
        const respuesta = await fetch(urlBusqueda);
        const datos = await respuesta.json();

        if (datos.results && datos.results.length > 0) {
            // Azure devuelve las posiciones dentro de .position
            const latDestino = datos.results[0].position.lat;
            const lngDestino = datos.results[0].position.lon;

            // Dibujar el pin de destino
            dsDestino.clear();
            dsDestino.add(new atlas.data.Feature(new atlas.data.Point([lngDestino, latDestino])));

            if (miUbicacionActual) {
                // Llamamos a Go para que haga la magia matemática
                buscarMejorRutaEnGo(
                    miUbicacionActual.lat,
                    miUbicacionActual.lng,
                    latDestino,
                    lngDestino
                );
            } else {
                alert("Esperando a obtener tu ubicación GPS actual...");
            }
        } else {
            alert("No se encontró el lugar. Intenta usar un nombre más conocido.");
        }
    } catch (error) {
        console.error("Error al buscar:", error);
        alert("Error de conexión al buscar el destino.");
    } finally {
        if(boton) boton.innerText = "Ir";
    }
}

// --- COMUNICACIÓN CON EL BACKEND EN GO ---
async function buscarMejorRutaEnGo(latA, lngA, latB, lngB) {
    try {
        const data = await apiBuscarRuta(latA, lngA, latB, lngB);

        if (data.mensaje) {
            alert(data.mensaje);
        } else {
            const coordenadasCamino = JSON.parse(data.camino);

            // Limpiar trazos previos
            dsRuta.clear();
            dsParadas.clear();

            // Dibujar la ruta recomendada (Convertir [lat, lng] de Go a [lng, lat] de Azure)
            let coordsAzure = coordenadasCamino.map(c => [c[1], c[0]]);
            dsRuta.add(new atlas.data.Feature(new atlas.data.LineString(coordsAzure)));

            // Extraer el primer y último punto para colocar los pines de Subida y Bajada
            const puntoOrigen = coordsAzure[0];
            const puntoDestino = coordsAzure[coordsAzure.length - 1];

            dsParadas.add([
                new atlas.data.Feature(new atlas.data.Point(puntoOrigen), { title: "🟢 " + data.parada_origen_nombre }),
                new atlas.data.Feature(new atlas.data.Point(puntoDestino), { title: "🔴 " + data.parada_destino_nombre })
            ]);

            // 🛑 Ajustar automáticamente la cámara (Sin irnos a África)
                        mapa.setCamera({
                            bounds: atlas.data.BoundingBox.fromPositions(coordsAzure),
                            padding: 50
                        });

            // Actualizar la tarjeta flotante de la interfaz
            document.getElementById("ruta-titulo").innerText = `¡Toma la ${data.nombre_ruta}!`;
            document.getElementById("ruta-subida").innerText = data.parada_origen_nombre;
            document.getElementById("ruta-bajada").innerText = data.parada_destino_nombre;
            document.getElementById("tarjeta-ruta").style.display = "block";
        }
    } catch (error) {
        console.error("Error al conectar con la API:", error);
        alert("Error de conexión con el servidor de rutas.");
    }
}

// --- CARGAR PUNTOS DE REFERENCIA CERCANOS ---
async function cargarLugaresDeReferencia(lat, lng) {
    // Buscamos cosas útiles para el usuario promedio
    const categorias = "Oxxo, farmacia, escuela, parque, plaza, hospital";
    // Buscamos en un radio de 1.5 kilómetros (1500 metros)
    const urlPOIs = `https://atlas.microsoft.com/search/fuzzy/json?api-version=1.0&query=${encodeURIComponent(categorias)}&lat=${lat}&lon=${lng}&radius=1500&limit=15&subscription-key=${AZURE_MAPS_KEY}`;

    try {
        const respuesta = await fetch(urlPOIs);
        const datos = await respuesta.json();

        dsPOIs.clear(); // Limpiar para no amontonar iconos si el usuario se mueve

        if (datos.results) {
            const lugares = datos.results.map(lugar => {
                let nombreLugar = lugar.poi ? lugar.poi.name : "Lugar";
                return new atlas.data.Feature(
                    new atlas.data.Point([lugar.position.lon, lugar.position.lat]),
                    { name: nombreLugar }
                );
            });
            dsPOIs.add(lugares);
        }
    } catch (error) {
        console.error("Error cargando lugares de referencia:", error);
    }
}
