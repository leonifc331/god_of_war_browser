package mesh

import (
	"log"
	"net/http"

	"github.com/mogaika/god_of_war_browser/pack/wad"
	"github.com/mogaika/god_of_war_browser/utils/gltfutils"
	"github.com/mogaika/god_of_war_browser/webutils"
)

func (mesh *Mesh) HttpAction(wrsrc *wad.WadNodeRsrc, w http.ResponseWriter, r *http.Request) {
	webutils.WriteFileHeaders(w, wrsrc.Tag.Name+".obj")
	if err := mesh.ExportObj(w, nil); err != nil {
		log.Printf("Error when exporting mesh as obj: %v", err)
	}

	webutils.WriteFileHeaders(w, wrsrc.Tag.Name+".glb")
	if _, err := mesh.ExportGLTFDefault(wrsrc); err != nil {
		log.Printf("Error when exporting mesh as gltf: %v", err)
	}
}
