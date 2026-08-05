package utils

import "math"

func Haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const radioTierraKm = 6371.0

	lat1Rad := lat1 * math.Pi / 180
	lon1Rad := lon1 * math.Pi / 180
	lat2Rad := lat2 * math.Pi / 180
	lon2Rad := lon2 * math.Pi / 180

	dLat := lat2Rad - lat1Rad
	dLon := lon2Rad - lon1Rad

	a := math.Pow(math.Sin(dLat/2), 2) + math.Cos(lat1Rad)*math.Cos(lat2Rad)*math.Pow(math.Sin(dLon/2), 2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return radioTierraKm * c * 1000
}

func BuscarIndiceMasCercano(camino [][]float64, latParada, lngParada float64) int {
	mejorIndice := 0
	distanciaMinima := math.MaxFloat64

	for i, punto := range camino {
		if len(punto) >= 2 {
			dist := Haversine(latParada, lngParada, punto[0], punto[1])
			if dist < distanciaMinima {
				distanciaMinima = dist
				mejorIndice = i
			}
		}
	}
	return mejorIndice
}
