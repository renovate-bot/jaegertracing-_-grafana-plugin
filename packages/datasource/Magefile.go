//go:build mage

package main

import (
	// mage:import
	build "github.com/grafana/grafana-plugin-sdk-go/build"
)

// Default target: build production executables for all supported platforms.
var Default = build.BuildAll
