package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"backend-transporte/bd"
	"backend-transporte/handlers"
)

func main() {
	// 1. Conexión a Base de Datos (Local o Nube)
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		connStr = "user=postgres password=1415 dbname=bdRutaspuebla sslmode=disable"
	}
	bd.Inicializar(connStr)
	defer bd.Conexion.Close()

	// 2. Registro de Endpoints de la API
	http.HandleFunc("/api/rutas", handlers.HabilitarCORS(handlers.RutasHandler))
	http.HandleFunc("/api/paradas", handlers.HabilitarCORS(handlers.ParadasHandler))
	http.HandleFunc("/api/paradas/cercana", handlers.HabilitarCORS(handlers.ParadaCercanaHandler))
	http.HandleFunc("/api/buscar-ruta", handlers.HandlerBuscarRuta)

	// 3. Servir el Frontend (Sube un nivel hacia paginaJs)
	http.Handle("/", http.FileServer(http.Dir("../paginaJs")))

	// 4. Configuración del Puerto (Local o Nube)
	puerto := os.Getenv("PORT")
	if puerto == "" {
		puerto = "8080"
	}

	fmt.Println("Servidor corriendo en el puerto:", puerto)
	if err := http.ListenAndServe(":"+puerto, nil); err != nil {
		log.Fatal(err)
	}
}
