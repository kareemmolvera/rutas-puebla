package main

import (
	"backend-transporte/bd"
	"backend-transporte/handlers"
	"fmt"
	"log"
	"net/http"
	"os"
)

// 1. EL CADENERO DE LA API
func authAPI(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodOptions {
			next(w, r)
			return
		}

		// Leemos las credenciales desde el entorno seguro del servidor
		expectedUser := os.Getenv("ADMIN_USER")
		expectedPass := os.Getenv("ADMIN_PASS")

		if expectedUser == "" {
			expectedUser = "admin"
		}
		if expectedPass == "" {
			expectedPass = "local"
		}

		user, pass, ok := r.BasicAuth()
		if !ok || user != expectedUser || pass != expectedPass {
			w.Header().Set("WWW-Authenticate", `Basic realm="Panel Administrativo"`)
			http.Error(w, "Acceso denegado a la Base de Datos", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func main() {
	// Conexión a Base de Datos
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		connStr = "user=postgres password=1415 dbname=bdRutaspuebla sslmode=disable"
	}
	bd.Inicializar(connStr)
	defer bd.Conexion.Close()

	// 2. REGISTRO SEGURO: Envolvemos las APIs vulnerables con el cadenero (authAPI)
	http.HandleFunc("/api/rutas", handlers.HabilitarCORS(authAPI(handlers.RutasHandler)))
	http.HandleFunc("/api/paradas", handlers.HabilitarCORS(authAPI(handlers.ParadasHandler)))

	http.HandleFunc("/api/paradas/cercana", handlers.HabilitarCORS(handlers.ParadaCercanaHandler))
	http.HandleFunc("/api/buscar-ruta", handlers.HandlerBuscarRuta)

	http.HandleFunc("/config.js", func(w http.ResponseWriter, r *http.Request) {
		llaveAzure := os.Getenv("AZURE_MAPS_KEY")
		if llaveAzure == "" {
			llaveAzure = "8Q3AVe2gCxB3xk0Ga3U3y1LvqjpTe6Fk9zui4KIfEpv9UWUJvGddJQQJ99CGACYeBjFjleVwAAAgAZMP4FKk"
		}
		w.Header().Set("Content-Type", "application/javascript")
		fmt.Fprintf(w, "const AZURE_MAPS_KEY = '%s';", llaveAzure)
	})

	// 3. PARA BLOQUEAR EL NAVEGADOR
	fs := http.FileServer(http.Dir("../paginaJs"))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" || r.URL.Path == "/app.js" {

			expectedUser := os.Getenv("ADMIN_USER")
			expectedPass := os.Getenv("ADMIN_PASS")
			if expectedUser == "" {
				expectedUser = "admin"
			}
			if expectedPass == "" {
				expectedPass = "local"
			}

			user, pass, ok := r.BasicAuth()
			if !ok || user != expectedUser || pass != expectedPass {
				w.Header().Set("WWW-Authenticate", `Basic realm="Acceso Restringido"`)
				http.Error(w, "Acceso exclusivo para el administrador", http.StatusUnauthorized)
				return
			}
		}
		fs.ServeHTTP(w, r)
	})
	// 4. Configuración del Puerto
	puerto := os.Getenv("PORT")
	if puerto == "" {
		puerto = "8080"
	}

	fmt.Println("Servidor corriendo en el puerto:", puerto)
	if err := http.ListenAndServe(":"+puerto, nil); err != nil {
		log.Fatal(err)
	}
}
