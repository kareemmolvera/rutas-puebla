package handlers

import (
	"backend-transporte/bd"
	"backend-transporte/modelos"
	"backend-transporte/utils"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
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
		var req struct {
			RutaID   int     `json:"ruta_id"`
			ParadaID int     `json:"parada_id"` // Vendrá si reutilizamos una parada existente
			Nombre   string  `json:"nombre"`
			Latitud  float64 `json:"latitud"`
			Longitud float64 `json:"longitud"`
			Orden    int     `json:"orden"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Datos inválidos", http.StatusBadRequest)
			return
		}

		tx, err := bd.Conexion.Begin()
		if err != nil {
			http.Error(w, "Error iniciando transacción", http.StatusInternalServerError)
			return
		}

		var paradaID int

		if req.ParadaID == 0 {
			err = tx.QueryRow(
				`INSERT INTO paradas (nombre, latitud, longitud) VALUES ($1, $2, $3) RETURNING id;`,
				req.Nombre, req.Latitud, req.Longitud,
			).Scan(&paradaID)

			if err != nil {
				tx.Rollback() // Si falla, abortamos todo
				http.Error(w, "Error creando parada en BD: "+err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			paradaID = req.ParadaID
		}

		_, err = tx.Exec(
			`INSERT INTO rutas_paradas (ruta_id, parada_id, orden) VALUES ($1, $2, $3);`,
			req.RutaID, paradaID, req.Orden,
		)

		if err != nil {
			tx.Rollback() // Si la vinculación falla, la parada nueva tampoco se guarda
			http.Error(w, "Error vinculando la parada con la ruta: "+err.Error(), http.StatusInternalServerError)
			return
		}

		tx.Commit()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, `{"mensaje": "Parada procesada y vinculada", "id": %d}`, paradaID)

	case http.MethodGet:
		// Actualizamos el SELECT quitando el ruta_id
		rows, err := bd.Conexion.Query(`SELECT id, nombre, latitud, longitud FROM paradas;`)
		if err != nil {
			http.Error(w, "Error BD", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		lista := []modelos.Parada{}
		for rows.Next() {
			var p modelos.Parada
			// Actualizamos el Scan para que coincida[cite: 2]
			rows.Scan(&p.ID, &p.Nombre, &p.Latitud, &p.Longitud)
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

	rows, err := bd.Conexion.Query(`SELECT id, nombre, latitud, longitud FROM paradas;`)
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
		rows.Scan(&p.ID, &p.Nombre, &p.Latitud, &p.Longitud)
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
		JOIN rutas_paradas rp1 ON r.id = rp1.ruta_id
		JOIN paradas p1 ON rp1.parada_id = p1.id
		JOIN rutas_paradas rp2 ON r.id = rp2.ruta_id
		JOIN paradas p2 ON rp2.parada_id = p2.id
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
		json.NewEncoder(w).Encode(map[string]string{"mensaje": "No se encontraron rutas cercanas a tu origen y destino."})
		return
	}

	var caminoCompleto [][]float64
	json.Unmarshal([]byte(resp.Camino), &caminoCompleto)

	if len(caminoCompleto) > 0 {
		idxInicio := utils.BuscarIndiceMasCercano(caminoCompleto, latO, lngO)
		idxFin := utils.BuscarIndiceMasCercano(caminoCompleto, latD, lngD)

		if idxInicio >= idxFin {
			// El camión ya pasó por el destino antes de llegar al usuario. Va en sentido contrario.
			json.NewEncoder(w).Encode(map[string]string{
				"mensaje": "La ruta detectada va en sentido contrario. Intenta caminar a la parada de enfrente o verifica las rutas de regreso.",
			})
			return
		}

		caminoRecortado := caminoCompleto[idxInicio : idxFin+1]
		caminoBytes, _ := json.Marshal(caminoRecortado)
		resp.Camino = string(caminoBytes)
	}
	json.NewEncoder(w).Encode(resp)
}
