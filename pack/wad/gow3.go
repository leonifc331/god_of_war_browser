package wad

import "fmt"

const (
	TAG_GOW3_ENTITY_COUNT     = 0
	TAG_GOW3_SERVER_INSTANCE  = 1
	TAG_GOW3_FILE_GROUP_START = 2
	TAG_GOW3_FILE_GROUP_END   = 3

	TAG_GOW3_HEADER_START = 19
	TAG_GOW3_HEADER_POP   = 22
)

func (w *Wad) gow3parseTag(tag *Tag, currentNode *NodeId, newGroupTag *bool, addNode func(tag *Tag) *Node) error {
	switch tag.Tag {
	case TAG_GOW3_SERVER_INSTANCE: // file data packet
		// Tell file server (server determined by first uint16)
		// that new file is loaded
		// if name start with space, then name ignored (unnamed)
		// overwrite previous instance with same name
		n := addNode(tag)
		if *newGroupTag {
			*newGroupTag = true
			*currentNode = n.Id
		}
	case TAG_GOW3_FILE_GROUP_START:
		*newGroupTag = true
	case TAG_GOW3_FILE_GROUP_END:
		if !*newGroupTag {
			if *currentNode == NODE_INVALID {
				return fmt.Errorf("Trying to end not started group id%d-%s", tag.Id, tag.Name)
			}
			*currentNode = w.GetNodeById(*currentNode).Parent
		} else {
			*newGroupTag = false
		}
		addNode(tag)
	case TAG_GOW3_HEADER_START:
		addNode(tag)
	default:
		// return fmt.Errorf("unknown tag id%.4x-tag%.4x-%s offset 0x%.6x", tag.Id, tag.Tag, tag.Name, tag.DebugPos)
	}
	return nil
}
