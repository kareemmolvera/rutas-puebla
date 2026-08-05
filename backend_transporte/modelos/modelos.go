package modelos

//Modelos para la base de datos

import "encoding/json"

type SolicitudBusqueda struct {
	LatOrigen  float64 `json:"lat_origen"`
	LngOrigen  float64 `json:"lng_origen"`
	LatDestino float64 `json:"lat_destino"`
	LngDestino float64 `json:"lng_destino"`
}

type RespuestaBusqueda struct {
	RutaID         int    `json:"ruta_id"`
	NombreRuta     string `json:"nombre_ruta"`
	Camino         string `json:"camino"`
	ParadaCercanaA string `json:"parada_origen_nombre"`
	ParadaCercanaB string `json:"parada_destino_nombre"`
}

type Ruta struct {
	ID          int             `json:"id"`
	Nombre      string          `json:"nombre"`
	Tipo        string          `json:"tipo"`
	Coordenadas json.RawMessage `json:"coordenadas"`
}

type Parada struct {
	ID       int     `json:"id"`
	Nombre   string  `json:"nombre"`
	Latitud  float64 `json:"latitud"`
	Longitud float64 `json:"longitud"`
}

type RutaParada struct {
	RutaID   int `json:"ruta_id"`
	ParadaID int `json:"parada_id"`
	Orden    int `json:"orden"`
}

type RespuestaParada struct {
	Parada
	DistanciaMetros float64 `json:"distancia_metros"`
}
