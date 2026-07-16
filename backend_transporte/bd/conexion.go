package bd

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

// Variable global exportada para que los handlers la usen
var Conexion *sql.DB

func Inicializar(connStr string) {
	var err error
	Conexion, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Error conectando a la BD: ", err)
	}

	if err = inicializarTablas(); err != nil {
		log.Fatal("Error creando tablas: ", err)
	}
	fmt.Println("¡Tablas y BD listas!")
}

// Función con minúscula porque solo se usa dentro de este archivo
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

	if _, err := Conexion.Exec(queryRutas); err != nil {
		return err
	}
	if _, err := Conexion.Exec(queryParadas); err != nil {
		return err
	}
	return nil
}
