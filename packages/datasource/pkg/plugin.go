package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
)

// pluginConfig holds the datasource JSON config fields set in the ConfigEditor.
type pluginConfig struct {
	// ProxyMode enables the Go backend proxy. When false the frontend uses jaegerBaseUrl directly.
	ProxyMode bool `json:"proxyMode"`
	// JaegerInternalURL is the internal (non-SSO) address of the Jaeger query service,
	// used by the Go proxy to forward requests server-side.
	JaegerInternalURL string `json:"jaegerInternalURL"`
}

type JaegerDatasource struct {
	config    pluginConfig
	jaegerURL *url.URL // parsed and validated at construction time
}

func NewJaegerDatasource(_ context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	var cfg pluginConfig
	if err := json.Unmarshal(settings.JSONData, &cfg); err != nil {
		return nil, fmt.Errorf("parsing plugin config: %w", err)
	}

	var jaegerURL *url.URL
	if cfg.ProxyMode {
		if cfg.JaegerInternalURL == "" {
			return nil, fmt.Errorf("proxy mode is enabled but jaegerInternalURL is not set")
		}
		u, err := url.Parse(cfg.JaegerInternalURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			return nil, fmt.Errorf("jaegerInternalURL must be a valid http/https URL, got %q", cfg.JaegerInternalURL)
		}
		jaegerURL = u
	}

	return &JaegerDatasource{config: cfg, jaegerURL: jaegerURL}, nil
}

func (d *JaegerDatasource) Dispose() {}

// CheckHealth forwards a health check to /api/services on the Jaeger backend.
func (d *JaegerDatasource) CheckHealth(ctx context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	if !d.config.ProxyMode {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusOk,
			Message: "Direct mode — backend health check not applicable",
		}, nil
	}

	if err := checkJaegerReachable(ctx, d.jaegerURL); err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Cannot reach Jaeger at %s: %v", d.jaegerURL, err),
		}, nil
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: fmt.Sprintf("Connected to Jaeger at %s", d.jaegerURL),
	}, nil
}

// CallResource proxies all requests through to Jaeger in proxy mode.
// The TypeScript frontend routes iframe navigation and API calls through
// /api/datasources/uid/<uid>/resources/... when proxy mode is on.
func (d *JaegerDatasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	if !d.config.ProxyMode {
		return sender.Send(&backend.CallResourceResponse{
			Status: 404,
			Body:   []byte("proxy mode is not enabled"),
		})
	}
	uid := req.PluginContext.DataSourceInstanceSettings.UID
	proxyBase := "/api/datasources/uid/" + uid + "/resources"
	return proxyToJaeger(ctx, d.jaegerURL, proxyBase, req, sender)
}
