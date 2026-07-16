package handlers

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"

	"backend-transporte/bd"
	"backend-transporte/modelos"
	"backend-transporte/utils"
)

func HabilitarCORS(siguiente http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		siguiente(w, r)
	}
}

func RutasHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		var nuevaRuta modelos.Ruta
		if err := json.NewDecoder(r.Body).Decode(&nuevaRuta); err != nil {
			http.Error(w, "Datos inválidos", http.StatusBadRequest)
			return
		}
		var id int
		err := bd.Conexion.QueryRow(
			`INSERT INTO rutas (nombre, tipo, coordenadas) VALUES ($1, $2, $3) RETURNING id;`,
			nuevaRuta.Nombre, nuevaRuta.Tipo, string(nuevaRuta.Coordenadas),
		).Scan(&id)
		if err != nil {
			http.Error(w, "Error BD: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, `{"mensaje": "Ruta guardada", "id": %d}`, id)

	case http.MethodGet:
		rows, err := bd.Conexion.Query(`SELECT id, nombre, tipo, coordenadas FROM rutas;`)
		if err != nil {
			http.Error(w, "Error BD", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		lista := []modelos.Ruta{}
		for rows.Next() {
			var ru modelos.Ruta
			rows.Scan(&ru.ID, &ru.Nombre, &ru.Tipo, &ru.Coordenadas)
			lista = append(lista, ru)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(lista)
	}
}

func ParadasHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		var p modelos.Parada
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "Datos inválidos", http.StatusBadRequest)
			return
		}
		var id int
		err := bd.Conexion.QueryRow(
			`INSERT INTO paradas (ruta_id, nombre, latitud, longitud) VALUES ($1, $2, $3, $4) RETURNING id;`,
			p.RutaID, p.Nombre, p.Latitud, p.Longitud,
		).Scan(&id)
		if err != nil {
			http.Error(w, "Error BD: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, `{"mensaje": "Parada guardada", "id": %d}`, id)

	case http.MethodGet:
		rows, err := bd.Conexion.Query(`SELECT id, ruta_id, nombre, latitud, longitud FROM paradas;`)
		if err != nil {
			http.Error(w, "Error BD", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		lista := []modelos.Parada{}
		for rows.Next() {
			var p modelos.Parada
			rows.Scan(&p.ID, &p.RutaID, &p.Nombre, &p.Latitud, &p.Longitud)
			lista = append(lista, p)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(lista)
	}
}

func ParadaCercanaHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}
	lat, _ := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lng, _ := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)

	rows, err := bd.Conexion.Query(`SELECT id, ruta_id, nombre, latitud, longitud FROM paradas;`)
	if err != nil {
		http.Error(w, "Error BD: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var masCercana modelos.Parada
	minDist := math.MaxFloat64
	encontro := false

	for rows.Next() {
		var p modelos.Parada
		rows.Scan(&p.ID, &p.RutaID, &p.Nombre, &p.Latitud, &p.Longitud)
		dist := utils.Haversine(lat, lng, p.Latitud, p.Longitud)
		if dist < minDist {
			minDist = dist
			masCercana = p
			encontro = true
		}
	}

	if !encontro {
		http.Error(w, "Sin paradas", http.StatusNotFound)
		return
	}

	resp := modelos.RespuestaParada{
		Parada:          masCercana,
		DistanciaMetros: math.Round(minDist*100) / 100,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func HandlerBuscarRuta(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
		return
	}

	var sol modelos.SolicitudBusqueda
	if err := json.NewDecoder(r.Body).Decode(&sol); err != nil {
		http.Error(w, "Datos inválidos", http.StatusBadRequest)
		return
	}

	query := `
		SELECT 
			r.id, r.nombre, r.coordenadas as camino,
			p1.nombre as parada_origen, p2.nombre as parada_destino,
			p1.latitud, p1.longitud, p2.latitud, p2.longitud
		FROM rutas r
		JOIN paradas p1 ON r.id = p1.ruta_id
		JOIN paradas p2 ON r.id = p2.ruta_id
		WHERE 
			(6371 * acos(cos(radians($1)) * cos(radians(p1.latitud)) * cos(radians(p1.longitud) - radians($2)) + sin(radians($1)) * sin(radians(p1.latitud)))) < 1.0
			AND 
			(6371 * acos(cos(radians($3)) * cos(radians(p2.latitud)) * cos(radians(p2.longitud) - radians($4)) + sin(radians($3)) * sin(radians(p2.latitud)))) < 1.0
		ORDER BY (
			(6371 * acos(cos(radians($1)) * cos(radians(p1.latitud)) * cos(radians(p1.longitud) - radians($2)) + sin(radians($1)) * sin(radians(p1.latitud)))) +
			(6371 * acos(cos(radians($3)) * cos(radians(p2.latitud)) * cos(radians(p2.longitud) - radians($4)) + sin(radians($3)) * sin(radians(p2.latitud))))
		) ASC
		LIMIT 1;`

	var resp modelos.RespuestaBusqueda
	var latO, lngO, latD, lngD float64

	err := bd.Conexion.QueryRow(query, sol.LatOrigen, sol.LngOrigen, sol.LatDestino, sol.LngDestino).Scan(
		&resp.RutaID, &resp.NombreRuta, &resp.Camino,
		&resp.ParadaCercanaA, &resp.ParadaCercanaB,
		&latO, &lngO, &latD, &lngD,
	)

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"mensaje": "No se encontraron rutas."})
		return
	}

	var caminoCompleto [][]float64
	json.Unmarshal([]byte(resp.Camino), &caminoCompleto)

	if len(caminoCompleto) > 0 {
		idxInicio := utils.BuscarIndiceMasCercano(caminoCompleto, latO, lngO)
		idxFin := utils.BuscarIndiceMasCercano(caminoCompleto, latD, lngD)
		if idxInicio > idxFin {
			idxInicio, idxFin = idxFin, idxInicio
		}
		caminoRecortado := caminoCompleto[idxInicio : idxFin+1]
		caminoBytes, _ := json.Marshal(caminoRecortado)
		resp.Camino = string(caminoBytes)
	}
	json.NewEncoder(w).Encode(resp)
}
