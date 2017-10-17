package web

import (
	"log"
	"net/http"
	"os"
	"path"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"

	"github.com/mogaika/god_of_war_browser/pack"
)

var ServerPack pack.PackDriver

func StartServer(addr string, _pack pack.PackDriver, webPath string) error {
	ServerPack = _pack

	r := mux.NewRouter()
	r.HandleFunc("/action/{file}/{param}/{action}", HandlerActionPackFileParam)
	r.HandleFunc("/json/pack/{file}/{param}", HandlerAjaxPackFileParam)
	r.HandleFunc("/json/pack/{file}", HandlerAjaxPackFile)
	r.HandleFunc("/json/pack", HandlerAjaxPack)
	r.HandleFunc("/dump/pack/{file}/{param}", HandlerDumpPackParamFile)
	r.HandleFunc("/dump/pack/{file}", HandlerDumpPackFile)
	r.HandleFunc("/upload/pack/{file}", HandlerUploadPackFile)
	r.HandleFunc("/upload/pack/{file}/{param}", HandlerUploadPackFileParam)

	r.PathPrefix("/").Handler(http.FileServer(http.Dir(path.Join(webPath, "data"))))

	h := handlers.RecoveryHandler()(r)
	h = handlers.LoggingHandler(os.Stdout, r)

	log.Printf("Starting server %v", addr)

	return http.ListenAndServe(addr, h)
}
