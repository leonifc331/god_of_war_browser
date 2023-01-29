package config

import (
	"log"
)

const (
	GOWunknown = iota
	GodOfWar1
	GodOfWar2
	GOW3
	GodOfWarGhostOfSparta
	GodOfWarChainsOfOlympus
	GOW2018 = 2018
)

const (
	PS2 = iota
	PS3
	PS4
	PSVita
	PC
)

type GOWVersion int
type PSVersion int

var godOfWarVersion GOWVersion = GOWunknown

var playStationVersion PSVersion = PS2

func GetGOWVersion() GOWVersion {
	return godOfWarVersion
}

func SetGOWVersion(v GOWVersion) {
	switch v {
	default:
		log.Panicf("Versão desconhecida '%v'", v)
	case GOWunknown:
	case GodOfWar1:
	case GodOfWar2:
   	case GOW3:
	case GodOfWarGhostOfSparta:
	case GodOfWarChainsOfOlympus:
	case GOW2018:
	}
	godOfWarVersion = v
}

func GetPlayStationVersion() PSVersion {
	return playStationVersion
}

func SetPlayStationVersion(psVersion PSVersion) {
	playStationVersion = psVersion
}
