document.addEventListener("DOMContentLoaded", () => {
  let panel = document.getElementById("panel-busqueda");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "panel-busqueda";
    document.body.appendChild(panel);
  }
  // Cambiamos el datalist por un ul para poder darle estilo
  panel.innerHTML = `
        <div id="contenedor-sugerencias">
          <input type="text" id="destino" autocomplete="off" placeholder="¿A dónde vas? (Ej. Zócalo, BUAP)">
          <ul id="lista-resultados"></ul>
        </div>
        <button id="btn-ir" onclick="buscarDestino()">Ir</button>
    `;

  // Event Listener para el Debounce
  const inputDestino = document.getElementById("destino");
  inputDestino.addEventListener('input', function(e) {
      buscarSugerencias(e.target.value);
  });
});

let timeoutBusqueda;
async function buscarSugerencias(texto) {
  const datalist = document.getElementById("lista-resultados");

  if (texto.trim().length < 3) {
      datalist.style.display = "none";
      return;
  }

  clearTimeout(timeoutBusqueda); // El famoso Debounce

  timeoutBusqueda = setTimeout(async () => {
    // Parámetros de Geofencing para Puebla
    const latPuebla = 19.0414;
    const lonPuebla = -98.2063;
    const radio = 15000;

    const urlSugerencias = `https://atlas.microsoft.com/search/fuzzy/json?api-version=1.0&query=${encodeURIComponent(texto)}&subscription-key=${AZURE_MAPS_KEY}&lat=${latPuebla}&lon=${lonPuebla}&radius=${radio}&countrySet=MX&limit=5`;

    try {
      const respuesta = await fetch(urlSugerencias);
      const datos = await respuesta.json();

      datalist.innerHTML = ""; // Limpiar lista

      if (datos.results && datos.results.length > 0) {
        datos.results.forEach((resultado) => {
          const li = document.createElement("li");
          li.className = "item-resultado";

          let nombreLugar = resultado.poi ? resultado.poi.name : resultado.address.freeformAddress;
          li.textContent = nombreLugar;

          // Qué hacer cuando el usuario toca la sugerencia
          li.onclick = () => {
              document.getElementById("destino").value = nombreLugar;
              datalist.style.display = "none"; // Ocultar lista
              buscarDestino(); //
          };

          datalist.appendChild(li);
        });
        datalist.style.display = "block"; // Mostrar lista
      } else {
          datalist.style.display = "none";
      }
    } catch (error) {
      console.error("Error cargando sugerencias:", error);
    }
  }, 400); // Espera 400ms
}



const mapa = new atlas.Map("mapa-usuario", {
  center: [-98.2063, 19.0414], // [Longitud, Latitud]
  zoom: 14,
  authOptions: {
    authType: "subscriptionKey",
    subscriptionKey: AZURE_MAPS_KEY,
  },
});

let dsGPS, dsDestino, dsRuta, dsParadas, dsPOIs;
let miUbicacionActual = null;
let primeraVezGPS = true;

mapa.events.add("ready", function () {
  dsGPS = new atlas.source.DataSource();
  mapa.sources.add(dsGPS);
  mapa.layers.add(
    new atlas.layer.SymbolLayer(dsGPS, null, {
      iconOptions: { image: "pin-blue" },
    }),
  );

  dsDestino = new atlas.source.DataSource();
  mapa.sources.add(dsDestino);
  mapa.layers.add(
    new atlas.layer.SymbolLayer(dsDestino, null, {
      iconOptions: { image: "pin-red" },
    }),
  );

  dsRuta = new atlas.source.DataSource();
  mapa.sources.add(dsRuta);
  mapa.layers.add(
    new atlas.layer.LineLayer(dsRuta, null, {
      strokeColor: "#ff5722",
      strokeWidth: 5,
    }),
  );

  dsParadas = new atlas.source.DataSource();
  mapa.sources.add(dsParadas);
  mapa.layers.add(
    new atlas.layer.SymbolLayer(dsParadas, null, {
      iconOptions: { image: "pin-round-darkblue" },
      textOptions: {
        textField: ["get", "title"],
        offset: [0, 1.2],
        color: "#000000",
        size: 14,
      },
    }),
  );

  dsPOIs = new atlas.source.DataSource();
  mapa.sources.add(dsPOIs);
  mapa.layers.add(
    new atlas.layer.SymbolLayer(dsPOIs, null, {
      iconOptions: {
        image: "marker-blue", // Un icono más pequeño para no estorbar
        size: 0.6,
      },
      textOptions: {
        textField: ["get", "name"], // Muestra el nombre del lugar (ej. "Oxxo")
        offset: [0, 1.2],
        size: 11,
        color: "#444444", // Gris oscuro para que no compita con los pines principales
      },
    }),
  );

  iniciarRastreoGPS();

  mapa.controls.add(
    [
      new atlas.control.ZoomControl(),
      new atlas.control.CompassControl(),
      new atlas.control.PitchControl(),
      new atlas.control.StyleControl({
        mapStyles: [
          "road",
          "road_shaded_relief",
          "satellite_road_labels",
          "night",
        ],
      }),
      new atlas.control.TrafficControl({
        incidents: true, // Activa los iconos de choques y obras
      }),
    ],
    {
      position: "bottom-right",
    },
  );
});

// --- RASTREO GPS ---
function iniciarRastreoGPS() {
  if ("geolocation" in navigator) {
    navigator.geolocation.watchPosition(
      (posicion) => {
        const lat = posicion.coords.latitude;
        const lng = posicion.coords.longitude;
        miUbicacionActual = { lat, lng };

        if (window.marcadorUsuario) {
          mapa.markers.remove(window.marcadorUsuario);
        }

        window.marcadorUsuario = new atlas.HtmlMarker({
          htmlContent: '<div class="marcador-gps-usuario"></div>',
          position: [lng, lat],
          pixelOffset: [0, 0], // 0,0 para que el centro del círculo sea tu ubicación exacta
        });

        mapa.markers.add(window.marcadorUsuario);

        if (primeraVezGPS) {
          mapa.setCamera({ center: [lng, lat], zoom: 15 });

          cargarLugaresDeReferencia(lat, lng);

          primeraVezGPS = false;
        }
      },
      (error) => {
        console.error("Error al obtener GPS:", error.message);
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  } else {
    alert("Tu navegador no soporta geolocalización.");
  }
}

async function buscarDestino() {
  const inputDestino = document.getElementById("destino").value;

  if (inputDestino.trim() === "") {
    alert("Por favor, escribe un destino.");
    return;
  }

  const boton = document.querySelector("#panel-busqueda button");
  boton.innerText = "...";

  const urlBusqueda = `https://atlas.microsoft.com/search/fuzzy/json?api-version=1.0&query=${encodeURIComponent(inputDestino + ", Puebla, Mexico")}&subscription-key=${AZURE_MAPS_KEY}&limit=1`;

  try {
    const respuesta = await fetch(urlBusqueda);
    const datos = await respuesta.json();

    if (datos.results && datos.results.length > 0) {
      const latDestino = datos.results[0].position.lat;
      const lngDestino = datos.results[0].position.lon;

      dsDestino.clear();
      dsDestino.add(
        new atlas.data.Feature(new atlas.data.Point([lngDestino, latDestino])),
      );

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
    } else {
      alert("No se encontró el lugar. Intenta usar un nombre más conocido.");
    }
  } catch (error) {
    console.error("Error al buscar:", error);
    alert("Error de conexión al buscar el destino.");
  } finally {
    if (boton) boton.innerText = "Ir";
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

      dsRuta.clear();
      dsParadas.clear();

      let coordsAzure = coordenadasCamino.map((c) => [c[1], c[0]]);
      dsRuta.add(
        new atlas.data.Feature(new atlas.data.LineString(coordsAzure)),
      );

      const puntoOrigen = coordsAzure[0];
      const puntoDestino = coordsAzure[coordsAzure.length - 1];

      dsParadas.add([
        new atlas.data.Feature(new atlas.data.Point(puntoOrigen), {
          title: "🟢 " + data.parada_origen_nombre,
        }),
        new atlas.data.Feature(new atlas.data.Point(puntoDestino), {
          title: "🔴 " + data.parada_destino_nombre,
        }),
      ]);

      mapa.setCamera({
        bounds: atlas.data.BoundingBox.fromPositions(coordsAzure),
        padding: 50,
      });

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
async function cargarLugaresDeReferencia(lat, lng) {
  const categorias = [
    "Mercado",
    "Hospital",
    "Universidad",
    "Parque",
    "Centro Comercial",
    "Monumento",
    "Banco",
    "Oxxo",
    "Farmacia"
  ];

  try {
    dsPOIs.clear(); // Limpiamos pines anteriores

    const peticiones = categorias.map((categoria) => {
      const urlPOIs = `https://atlas.microsoft.com/search/fuzzy/json?api-version=1.0&query=${encodeURIComponent(categoria)}&lat=${lat}&lon=${lng}&radius=2500&limit=12&subscription-key=${AZURE_MAPS_KEY}`;
      return fetch(urlPOIs).then((r) => r.json());
    });

    const respuestas = await Promise.all(peticiones);

    respuestas.forEach((datos) => {
      if (datos.results) {
        const lugares = datos.results.map((lugar) => {
          let nombreLugar = lugar.poi ? lugar.poi.name : "Lugar";
          return new atlas.data.Feature(
            new atlas.data.Point([lugar.position.lon, lugar.position.lat]),
            { name: nombreLugar },
          );
        });
        dsPOIs.add(lugares); // Agregamos los lugares al mapa
      }
    });
  } catch (error) {
    console.error("Error cargando lugares de referencia:", error);[cite: 2]
  }
}
