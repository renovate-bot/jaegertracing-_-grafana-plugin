package main

import (
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

func main() {
	if err := datasource.Manage("jaegertracing-jaeger-datasource", NewJaegerDatasource, datasource.ManageOpts{}); err != nil {
		log.DefaultLogger.Error("Error managing plugin", "error", err)
		os.Exit(1)
	}
}
