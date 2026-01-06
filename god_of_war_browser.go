package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"time"

	"github.com/mogaika/god_of_war_browser/config"
	"github.com/mogaika/god_of_war_browser/drivers/iso"
	"github.com/mogaika/god_of_war_browser/drivers/psarc"
	"github.com/mogaika/god_of_war_browser/drivers/toc"
	"github.com/mogaika/god_of_war_browser/status"
	"github.com/mogaika/god_of_war_browser/vfs"
	"github.com/mogaika/god_of_war_browser/web"

	// Import all asset packages
	_ "github.com/mogaika/god_of_war_browser/pack/txt"
	_ "github.com/mogaika/god_of_war_browser/pack/vag"
	_ "github.com/mogaika/god_of_war_browser/pack/vpk"
	_ "github.com/mogaika/god_of_war_browser/pack/wad"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/anm"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/cam"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/collision"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/cxt"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/flp"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/gfx"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/inst"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/light"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/mat"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/mdl"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/mesh"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/obj"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/rsrcs"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/sbk"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/scr"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/shg"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/twk"
	_ "github.com/mogaika/god_of_war_browser/pack/wad/txr"
)

func main() {
	var addr, tocpath, dirpath, isopath, psarcpath, psversion, encoding string
	var gowversion int
	var parsecheck, listencodings bool

	flag.StringVar(&addr, "i", ":8000", "Server address")
	flag.StringVar(&tocpath, "toc", "", "Path to folder with TOC file")
	flag.StringVar(&dirpath, "dir", "", "Path to unpacked WADs")
	flag.StringVar(&isopath, "iso", "", "Path to ISO file")
	flag.StringVar(&psarcpath, "psarc", "", "Path to PS3 PSARC file")
	flag.StringVar(&psversion, "ps", "ps2", "PlayStation version (ps2, ps3, ps4, psvita, pc)")
	flag.IntVar(&gowversion, "gowversion", 0, "0-auto, 1-GodOfWar1, 2-GodOfWar2, 3-gow3, 4-GhostOfSparta, 5-ChainsOfOlympus, 2018-gow2018")
	flag.BoolVar(&parsecheck, "parsecheck", false, "Check all files for parse errors")
	flag.BoolVar(&listencodings, "listencodings", false, "List available text encodings")
	flag.StringVar(&encoding, "encoding", "Windows 1252", "Text encoding to use")
	flag.Parse()

	if listencodings {
		listEncodings()
		return
	}

	if encoding != "" {
		log.Printf("Setting encoding to %q", encoding)
		if err := config.SetEncoding(encoding); err != nil {
			log.Printf("Failed to set encoding %q: %v", encoding, err)
			listEncodings()
			return
		}
	}

	// Set PlayStation version
	switch psversion {
	case "ps2":
		config.SetPlayStationVersion(config.PS2)
	case "ps3":
		config.SetPlayStationVersion(config.PS3)
	case "ps4":
		config.SetPlayStationVersion(config.PS4)
	case "psvita":
		config.SetPlayStationVersion(config.PSVita)
	case "pc":
		config.SetPlayStationVersion(config.PC)
	default:
		log.Fatalf("Invalid PlayStation version. Use: ps2, ps3, ps4, psvita or pc")
	}

	// Validate God of War version
	if gowversion < 0 || (gowversion > 5 && gowversion != 2018) {
		log.Fatalf("Invalid God of War version. Use values 0-5 or 2018")
	}
	config.SetGOWVersion(config.GOWVersion(gowversion))

	var gameDir, driverDir vfs.Directory
	var err error
	var fileCloser io.Closer // Para manter o arquivo aberto

	switch {
	case psarcpath != "":
		if config.GetPlayStationVersion() != config.PS3 && config.GetPlayStationVersion() != config.PSVita {
			log.Fatalf("PSARC only supported for PS3/PSVita")
		}
		var f *os.File
		f, gameDir, err = setupPSARCDriver(psarcpath)
		fileCloser = f

	case isopath != "":
		var f *os.File
		f, driverDir, gameDir, err = setupISODriver(isopath)
		fileCloser = f

	case tocpath != "":
		gameDir, err = toc.NewTableOfContent(vfs.NewDirectoryDriver(tocpath))

	case dirpath != "":
		if gowversion == 0 {
			log.Fatalf("Must specify 'gowversion' when using directory mode")
		}
		gameDir = vfs.NewDirectoryDriver(dirpath)

	default:
		flag.PrintDefaults()
		return
	}

	if err != nil {
		log.Fatalf("Initialization failed: %v", err)
	}

	// Garante que o arquivo ISO/PSARC seja fechado apenas quando o programa terminar
	if fileCloser != nil {
		defer fileCloser.Close()
	}

	logFile, err := setupLogging()
	if err != nil {
		log.Printf("Failed to setup logging: %v", err)
	} else {
		defer logFile.Close()
	}

	if parsecheck {
		parseCheck(gameDir)
	}

	status.Info("Starting server on %s", addr)
	if err := web.StartServer(addr, gameDir, driverDir, "web"); err != nil {
		log.Fatalf("Failed to start web server: %v", err)
	}
}

func parseCheck(dir vfs.Directory) {
	log.Println("Starting parse check on all files...")
	startTime := time.Now()
	totalFiles := 0
	failedFiles := 0

	var checkDir func(vfs.Directory, string) error
	checkDir = func(currentDir vfs.Directory, path string) error {
		entries, err := currentDir.List()
		if err != nil {
			return fmt.Errorf("error listing directory %s: %v", path, err)
		}

		for _, entry := range entries {
			fullPath := path + "/" + entry.Name()
			if entry.IsDir() {
				subDir, err := currentDir.GetDirectory(entry.Name())
				if err != nil {
					log.Printf("ERROR: Couldn't access directory %s: %v", fullPath, err)
					failedFiles++
					continue
				}
				if err := checkDir(subDir, fullPath); err != nil {
					return err
				}
			} else {
				totalFiles++
				file, err := currentDir.GetFile(entry.Name())
				if err != nil {
					log.Printf("ERROR: Failed to get file %s: %v", fullPath, err)
					failedFiles++
					continue
				}


				if _, err := file.GetData(); err != nil {
					log.Printf("ERROR: Parse failed for %s: %v", fullPath, err)
					failedFiles++
					continue
				}
				

			}
		}
		return nil
	}

	if err := checkDir(dir, ""); err != nil {
		log.Printf("CRITICAL ERROR during check: %v", err)
	}

	duration := time.Since(startTime)
	successRate := 100.0
	if totalFiles > 0 {
		successRate = float64(totalFiles-failedFiles) / float64(totalFiles) * 100
	}

	log.Printf("Parse check completed!\n"+
		"Files checked: %d\n"+
		"Failed files: %d\n"+
		"Success rate: %.2f%%\n"+
		"Total time: %v",
		totalFiles, failedFiles, successRate, duration.Round(time.Millisecond))
}

func setupPSARCDriver(path string) (*os.File, vfs.Directory, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("error opening PSARC: %v", err)
	}
	
	drv, err := psarc.NewPsarcDriver(f)
	return f, drv, err
}

func setupISODriver(path string) (*os.File, vfs.Directory, vfs.Directory, error) {
	f, err := os.OpenFile(path, os.O_RDWR, 0666)
	if err != nil {
		log.Printf("Warning: Couldn't open ISO in RW mode, trying RO mode")
		f, err = os.Open(path)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("error opening ISO: %v", err)
		}
	}

	driverDir, err := iso.NewIsoDriver(f)
	if err != nil {
		f.Close() 
		return nil, nil, nil, err
	}

	gameDir, err := toc.NewTableOfContent(driverDir)
	return f, driverDir, gameDir, err
}

func setupLogging() (io.Closer, error) {
	if err := os.MkdirAll("applogs", 0755); err != nil {
		return nil, err
	}

	logPath := fmt.Sprintf("applogs/%s.log", time.Now().Format("2006-01-02_15-04-05"))
	f, err := os.Create(logPath)
	if err != nil {
		return nil, err
	}

	log.SetOutput(io.MultiWriter(os.Stdout, f))
	return f, nil
}

func listEncodings() {
	log.Println("Available encodings:")
	for _, enc := range config.ListEncodings() {
		log.Printf("  %s", enc)
	}
}
