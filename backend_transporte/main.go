package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"

	_ "github.com/lib/pq"
)

var db *sql.DB

type Ruta struct {
	ID          int             `json:"id"`
	Nombre      string          `json:"nombre"`
	Tipo        string          `json:"tipo"`
	Coordenadas json.RawMessage `json:"coordenadas"`
}

type Parada struct {
	ID       int     `json:"id"`
	RutaID   int     `json:"ruta_id"`
	Nombre   string  `json:"nombre"`
	Latitud  float64 `json:"latitud"`
	Longitud float64 `json:"longitud"`
}

// Estructura extra para devolver la parada junto con su distancia calculada
type RespuestaParada struct {
	Parada
	DistanciaMetros float64 `json:"distancia_metros"`
}

func inicializarTablas() error {
	queryRutas := `
	CREATE TABLE IF NOT EXISTS rutas (
		id SERIAL PRIMARY KEY,
		nombre VARCHAR(100) NOT NULL,
		tipo VARCHAR(20) NOT NULL,
		coordenadas JSONB NOT NULL
	);`

	queryParadas := `
	CREATE TABLE IF NOT EXISTS paradas (
		id SERIAL PRIMARY KEY,
		ruta_id INT REFERENCES rutas(id) ON DELETE CASCADE,
		nombre VARCHAR(100) NOT NULL,
		latitud NUMERIC(10, 8) NOT NULL,
		longitud NUMERIC(11, 8) NOT NULL
	);`

	if _, err := db.Exec(queryRutas); err != nil {
		return err
	}
	if _, err := db.Exec(queryParadas); err != nil {
		return err
	}
	return nil
}

// --- LÓGICA DE HAVERSINE ---
// Calcula la distancia en metros entre dos coordenadas geográficas
func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const radioTierraKm = 6371.0

	// Convertir grados a radianes
	lat1Rad := lat1 * math.Pi / 180
	lon1Rad := lon1 * math.Pi / 180
	lat2Rad := lat2 * math.Pi / 180
	lon2Rad := lon2 * math.Pi / 180

	dLat := lat2Rad - lat1Rad
	dLon := lon2Rad - lon1Rad

	// Fórmula
	a := math.Pow(math.Sin(dLat/2), 2) + math.Cos(lat1Rad)*math.Cos(lat2Rad)*math.Pow(math.Sin(dLon/2), 2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	distanciaKm := radioTierraKm * c
	return distanciaKm * 1000 // Multiplicamos por 1000 para devolver metros
}

// --- HANDLERS ---
func rutasHandler(w http.ResponseWriter, r *http.Request) {
	// (Mismo código de rutas que ya tenías)
	switch r.Method {
	case http.MethodPost:
		var nuevaRuta Ruta
		json.NewDecoder(r.Body).Decode(&nuevaRuta)
		var id int
		db.QueryRow(`INSERT INTO rutas (nombre, tipo, coordenadas) VALUES ($1, $2, $3) RETURNING id;`, nuevaRuta.Nombre, nuevaRuta.Tipo, nuevaRuta.Coordenadas).Scan(&id)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, `{"mensaje": "Ruta guardada", "id": %d}`, id)
	case http.MethodGet:
		rows, _ := db.Query(`SELECT id, nombre, tipo, coordenadas FROM rutas;`)
		defer rows.Close()
		listaRutas := []Ruta{}
		for rows.Next() {
			var ru Ruta
			rows.Scan(&ru.ID, &ru.Nombre, &ru.Tipo, &ru.Coordenadas)
			listaRutas = append(listaRutas, ru)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(listaRutas)
	}
}

func paradasHandler(w http.ResponseWriter, r *http.Request) {
	// (Mismo código de paradas que ya tenías)
	switch r.Method {
	case http.MethodPost:
		var p Parada
		json.NewDecoder(r.Body).Decode(&p)
		var id int
		db.QueryRow(`INSERT INTO paradas (ruta_id, nombre, latitud, longitud) VALUES ($1, $2, $3, $4) RETURNING id;`, p.RutaID, p.Nombre, p.Latitud, p.Longitud).Scan(&id)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, `{"mensaje": "Parada guardada", "id": %d}`, id)
	case http.MethodGet:
		rows, _ := db.Query(`SELECT id, ruta_id, nombre, latitud, longitud FROM paradas;`)
		defer rows.Close()
		lista := []Parada{}
		for rows.Next() {
			var p Parada
			rows.Scan(&p.ID, &p.RutaID, &p.Nombre, &p.Latitud, &p.Longitud)
			lista = append(lista, p)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(lista)
	}
}

// NUEVO HANDLER: Encuentra la parada más cercana usando Haversine
func paradaCercanaHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	// 1. Extraer la latitud y longitud del usuario desde la URL (ej. ?lat=19.04&lng=-98.20)
	latUsuarioStr := r.URL.Query().Get("lat")
	lngUsuarioStr := r.URL.Query().Get("lng")

	// Convertir los textos a números decimales (float64)
	latUsuario, errLat := strconv.ParseFloat(latUsuarioStr, 64)
	lngUsuario, errLng := strconv.ParseFloat(lngUsuarioStr, 64)

	if errLat != nil || errLng != nil {
		http.Error(w, "Faltan las coordenadas 'lat' y 'lng' o son inválidas", http.StatusBadRequest)
		return
	}

	// 2. Traer todas las paradas de la base de datos
	rows, err := db.Query(`SELECT id, ruta_id, nombre, latitud, longitud FROM paradas;`)
	if err != nil {
		http.Error(w, "Error BD: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// 3. Variables para rastrear la parada más cercana
	var paradaMasCercana Parada
	distanciaMinima := math.MaxFloat64 // Empezamos con el número más grande posible
	encontroParada := false

	// 4. Iterar sobre cada parada y calcular la distancia
	for rows.Next() {
		var p Parada
		rows.Scan(&p.ID, &p.RutaID, &p.Nombre, &p.Latitud, &p.Longitud)

		// Ejecutamos el algoritmo de Haversine
		distanciaActual := haversine(latUsuario, lngUsuario, p.Latitud, p.Longitud)

		// Si esta parada está más cerca que la anterior que revisamos, la guardamos
		if distanciaActual < distanciaMinima {
			distanciaMinima = distanciaActual
			paradaMasCercana = p
			encontroParada = true
		}
	}

	if !encontroParada {
		http.Error(w, "No hay paradas registradas", http.StatusNotFound)
		return
	}

	// 5. Devolver la parada ganadora y a cuántos metros está
	respuesta := RespuestaParada{
		Parada:          paradaMasCercana,
		DistanciaMetros: math.Round(distanciaMinima*100) / 100, // Redondear a 2 decimales
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(respuesta)
}

// Middleware para permitir CORS (Conexión entre Frontend y Backend)
func habilitarCORS(siguiente http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Permitimos que cualquier origen (como tu puerto 8000) acceda a la API
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		// Si el navegador solo envía una petición de verificación (Preflight), respondemos OK
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Si no es OPTIONS, continúa con el handler normal (rutas o paradas)
		siguiente(w, r)
	}
}

func main() {
	var err error
	connStr := "user=postgres password=1415 dbname=bdRutaspuebla sslmode=disable"

	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err = inicializarTablas(); err != nil {
		log.Fatal(err)
	}
	fmt.Println("¡Tablas y BD listas!")

	// Registro de Endpoints

	// Registro de Endpoints
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "API OK")
	})
	http.HandleFunc("/api/rutas", habilitarCORS(rutasHandler))
	http.HandleFunc("/api/paradas", habilitarCORS(paradasHandler))
	http.HandleFunc("/api/paradas/cercana", habilitarCORS(paradaCercanaHandler))

	fmt.Println("Servidor corriendo en http://localhost:8080")
	if err = http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
