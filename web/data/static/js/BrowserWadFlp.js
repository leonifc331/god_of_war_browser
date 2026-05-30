function gowTransform2d(pos, matrix) {
    this.matrix = mat4.create();
    if (pos !== undefined) {
        this.matrix[12] = pos[0];
        this.matrix[13] = pos[1];
    }
    if (matrix !== undefined) {
        this.matrix[0] = matrix[0];
        this.matrix[1] = matrix[1];
        this.matrix[4] = matrix[2];
        this.matrix[5] = matrix[3];
    }
    //this.pos = (pos === undefined) ? vec2.create() : pos;
    //this.matrix = (matrix === undefined) ? mat2.create() : matrix;
}

gowTransform2d.prototype.applyTransform = function(otherTransform) {
    //let result = new gowTransform2d(
    //	vec2.fromValues(this.pos[0] + otherTransform.pos[0], this.pos[1] + otherTransform.pos[1]),
    //	mat2.mul(mat2.create(), this.matrix, otherTransform.matrix));
    // console.log("AAAAPLLYY", this, otherTransform, result);
    let result = new gowTransform2d();
    mat4.mul(result.matrix, this.matrix, otherTransform.matrix);
    return result;
}

gowTransform2d.prototype.fromTransform = function(source) {
    mat4.copy(this.matrix, source.matrix);
}

gowTransform2d.prototype.scale = function(scale) {
    return mat4.scale(this.matrix, this.matrix, [scale, scale, scale]);
}

gowTransform2d.prototype.toMatrix3d = function() {
    // console.log(this);
    return this.matrix;
    return mat4.fromValues(
        this.matrix[0], this.matrix[1], 0, 0,
        this.matrix[2], this.matrix[3], 0, 0,
        0, 0, 1, 0,
        this.pos[0], this.pos[1], 0, 1);
}

function gowFlp(flp) {
    this.root = flp;
    this.data = flp.FLP;
    this.mdls = [];
    this.texmap = {};
    this.claimed = {};
}

gowFlp.prototype.claimTextures = function() {
    this.claimed = {};
    for (txr in this.texmap) {
        this.texmap[txr].claim();
        this.claimed[txr] = this.texmap[txr];
    }
}

gowFlp.prototype.unclaimTextures = function() {
    for (txr in this.claimed) {
        this.claimed[txr].unclaim();
        if (this.texmap[txr].refs === 0) {
            delete this.texmap[txr];
        }
    }
}

gowFlp.prototype.getObjArrByType = function(_type) {
    switch (_type) {
        case 1:
            return this.data.MeshPartReferences;
        case 3:
            return this.data.Fonts;
        case 4:
            return this.data.StaticLabels;
        case 5:
            return this.data.DynamicLabels;
        case 6:
            return this.data.Datas6;
        case 7:
            return this.data.Datas7;
        case 9:
            return this.data.Transformations;
        case 10:
            return this.data.BlendColors;
    };
};

gowFlp.prototype.getObjByHandler = function(h) {
    if (h.TypeArrayId == 8) {
        return this.data.Data8;
    }
    let arr = this.getObjArrByType(h.TypeArrayId);
    return arr ? arr[h.IdInThatTypeArray] : undefined;
}

gowFlp.prototype.getTransformFromObject = function(transform) {
    return new gowTransform2d([transform.OffsetX, transform.OffsetY], transform.Matrix);
}

gowFlp.prototype.cacheTexture = function(texture_name) {
    // return texture from cache or creates new
    if (!this.texmap.hasOwnProperty(texture_name)) {
        let texture;
        if (this.root.Textures[texture_name].Images.length) {
            let img = this.root.Textures[texture_name].Images[0].Image;
            texture = new RenderTexture('data:image/png;base64,' + img);
            texture.markAsFontTexture();
        } else {
            texture = gr_instance.emptyTexture;
        }
        this.texmap[texture_name] = texture;
    }
    return this.texmap[texture_name];
}

gowFlp.prototype.renderData2 = function(o, handler, frameIndex, transform, color) {
    if (o.MeshPartIndex < 0) {
        return [];
    }

    let model = new RenderModel();

    // console.log("MESH PART INDEX", o.MeshPartIndex);
    meshes = loadMeshPartFromAjax(model, this.root.Model.Meshes[0], o.MeshPartIndex);

    for (let iMesh in meshes) {
        let mesh = meshes[iMesh];
        if (mesh.meta.hasOwnProperty('object')) {
            meshes[iMesh].setMaterialID(mesh.meta.object);
        } else {
            meshes[iMesh].setMaterialID(0);
        }
    }

    if (o.Materials && o.Materials.length !== 0) {
        for (let iMaterial in o.Materials) {
            let flpMaterial = o.Materials[iMaterial];
            let material = new RenderMaterial();
            let layer = new RenderMaterialLayer();
            if (flpMaterial.TextureName) {
                layer.setTextures([this.cacheTexture(flpMaterial.TextureName)]);
            }
            layer.setHasAlphaAttribute();
            let newColor = [];
            for (let i = 0; i < 4; i++) {
                newColor[i] = color[i] * (((flpMaterial.Color >> (8 * i)) & 0xff) / 257);
            }
            layer.setColor(newColor);
            material.addLayer(layer);
            model.addMaterial(material);
        }
    }

    // console.log("rendered data2 ", o, handler, transform.pos, transform.Matrix, color);

    let node = new ObjectTreeNodeModel("flp_data2", model);
    node.setLocalMatrix(transform.toMatrix3d());

    // console.log("MODELS FROM DATA2", [model]);
    return [node];
}

gowFlp.prototype.renderData4 = function(o, handler, frameIndex, transform, color) {
    let elementTransform = this.getTransformFromObject(o.Transformation);
    let font, fontscale;
    let x = 0;
    let y = 0;
    let models = [];
    let baseColor = color;
    let commands = o.RenderCommandsList;

    transform = transform.applyTransform(elementTransform);

    for (let iCmd = 0; iCmd < commands.length; iCmd++) {
        let cmd = commands[iCmd];

        if (cmd.Flags & 8) {
            font = this.data.Fonts[this.data.GlobalHandlersIndexes[cmd.FontHandler].IdInThatTypeArray];
            fontscale = cmd.FontScale;
        }
        if (cmd.Flags & 4) {
            color = [];
            for (let i = 0; i < baseColor.length; i++) {
                color.push(baseColor[i] * (cmd.BlendColor[i] / 255.0));
            }
        }
        if (cmd.Flags & 2) {
            x = cmd.OffsetX;
        }
        if (cmd.Flags & 1) {
            y = cmd.OffsetY;
        }

        for (let iGlyph = 0; iGlyph < cmd.Glyphs.length; iGlyph++) {
            let glyph = cmd.Glyphs[iGlyph];
            let data2 = font.MeshesRefs[glyph.GlyphId];

            let charTransform = transform.applyTransform(new gowTransform2d([x, y]));
            charTransform.scale(cmd.FontScale);

            models = models.concat(this.renderData2(data2, handler, frameIndex, charTransform, color));
            x += glyph.Width;
        }
    }
    //console.log("MODELS FROM DATA4", models);
    return models;
}

gowFlp.prototype.renderData6sub1 = function(o, handler, frameIndex, transform, color) {
    let models = [];
    for (let iElement = 0; iElement < o.ElementsAnimation.length; iElement++) {
        let flpElement = o.ElementsAnimation[iElement];
        // search current frame
        let currentFrame;

        for (let iFrame = 0; iFrame < flpElement.KeyFrames.length; iFrame++) {
            currentFrame = flpElement.KeyFrames[iFrame];
            // console.info(frameIndex, "+ 1 >=", currentFrame.WhenThisFrameEnds);
            if (frameIndex > currentFrame.WhenThisFrameEnds) {
                continue;
            } else {
                break;
            }
        }
        if (currentFrame === undefined) {
            console.warn("DIDNT FOUND FRAME TO RENDER");
            continue;
        }

        let elementTransform = this.data.Transformations[currentFrame.TransformationId];
        let elementColor = this.data.BlendColors[currentFrame.ColorId];

        let newTransform = elementTransform ?
            transform.applyTransform(this.getTransformFromObject(elementTransform)) : transform;

        let newColor = color;
        if (elementColor) {
            newColor = [];
            for (let i in elementColor.Color) {
                newColor.push((elementColor.Color[i] / 256.0) * color[i]);
            }
        }

        // console.info("idx", handler.IdInThatTypeArray, "el", iElement, "frame",
        // 	currentFrame.WhenThisFrameEnds, newTransform.matrix, color, currentFrame.ElementHandler);	
        let elementModels = this.renderElementByHandler(currentFrame.ElementHandler, 0, newTransform, newColor);
        models = models.concat(elementModels);
    }
    //console.log("MODELS FROM DATA6sub1", models);
    return models;
}

gowFlp.prototype.renderElementByHandler = function(handler, frameIndex, transform, color) {
    // color in range [0, 1]
    if (transform === undefined) {
        transform = new gowTransform2d();
    }
    if (frameIndex === undefined) {
        frameIndex = 0;
    }
    if (color === undefined) {
        color = [1, 1, 1, 1];
    }

    let o = this.getObjByHandler(handler);

    // console.info("rendering item", handler, o);

    switch (handler.TypeArrayId) {
        case 0:
            return [];
        case 1:
            return this.renderData2(o, handler, frameIndex, transform, color);
        case 4:
            return this.renderData4(o, handler, frameIndex, transform, color);
        case 5:
            return []; // TODO: render for text
        case 6:
            return this.renderData6sub1(o.Sub1, handler, frameIndex, transform, color);
        case 7:
        case 8:
            return this.renderData6sub1(o, handler, frameIndex, transform, color);
    }
    console.warn("unknown render for handler", handler, "object", o);
    return [];
}

function summaryLoadWadFlp(flp, wad, tagid) {
    let flpdata = flp.FLP;

    let object_renderer_handler = {
        TypeArrayId: 1,
        IdInThatTypeArray: 2
    };
    let object_renderer_frame = 0;

    let flp_print_dump = function() {
        set3dVisible(false);
        dataSummary.empty();

        let downloadJSON = $('<button>').text("Download as json").click(function() {
            window.open(getActionLinkForWadNode(wad, tagid, 'asjson'), '_blank');
        });
        dataSummary.append($('<p>').append(downloadJSON));

        let uploadJSON = $('<button>').text("Upload from json");
        uploadJSON.attr("href", getActionLinkForWadNode(wad, tagid, 'fromjson'));
        uploadJSON.click(function() {
            console.log($(this).attr('href'));
            uploadAjaxHandler.call(this);
        });
        dataSummary.append($('<p>').append(uploadJSON));

        let downloadFontJSON = $('<button>').text("Download font as json").click(function() {
            window.open(getActionLinkForWadNode(wad, tagid, 'exportfont'), '_blank');
        });
        dataSummary.append($('<p>').append(downloadFontJSON));


        let replaceFontJSON = $('<button>').text("Replace font from json");
        replaceFontJSON.attr("href", getActionLinkForWadNode(wad, tagid, 'replacefont'));
        replaceFontJSON.click(function() {
            console.log($(this).attr('href'));
            uploadAjaxHandler.call(this);
        });
        dataSummary.append($('<p>').append(replaceFontJSON));

        let showDump = $('<button>').text("Expand dump").click(function() {
            $(this).attr("disabled", true);
            dataSummary.append($("<pre>").append(JSON.stringify(flpdata, null, "  ").replaceAll('\n', '<br>')));
        });
        dataSummary.append($('<p>').append(showDump));
    }

    const objNamesArray = ['Nothing', 'Textured mesh part', 'UNKNOWN', 'Font',
        'Static label', 'Dynamic label', 'Data6', 'Data7',
        'Root', 'Transform', 'Color'
    ];

    let get_obj_arr_by_id = function(t) {
        switch (t) {
            case 1:
                return flpdata.MeshPartReferences;
                break;
            case 3:
                return flpdata.Fonts;
                break;
            case 4:
                return flpdata.StaticLabels;
                break;
            case 5:
                return flpdata.DynamicLabels;
                break;
            case 6:
                return flpdata.Datas6;
                break;
            case 7:
                return flpdata.Datas7;
                break;
            case 9:
                return flpdata.Transformations;
                break;
            case 10:
                return flpdata.BlendColors;
                break;
        };
        return undefined;
    };

    let get_obj_by_handler = function(h) {
        if (h.TypeArrayId == 8) {
            return flpdata.Data8;
        } else {
            let arr = get_obj_arr_by_id(h.TypeArrayId);
            if (arr) {
                return arr[h.IdInThatTypeArray];
            } else {
                return undefined;
            }
        }
    }

    let print_static_label_as_tr = function(iSl, needref = true) {
        let sl = flpdata.StaticLabels[iSl];
        let row = $("<tr>");

        if (needref) {
            row.append($("<td>").append($("<a>").addClass('flpobjref').text("id " + iSl).click(function() {
                flp_obj_view_history.unshift({
                    TypeArrayId: 4,
                    IdInThatTypeArray: iSl
                });
                flp_view_object_viewer();
            })));
        }

        let font = undefined;
        let cmdsContainer = $("<td>");
        for (let iCmd in sl.RenderCommandsList) {
            let rcmds = $("<table width='100%'>");
            let cmd = sl.RenderCommandsList[iCmd];

            if (cmd.Flags & 8) {
                let fhi = $("<input type=text id='fonthandler' class=no-width>").val(cmd.FontHandler);
                let fsi = $("<input type=text id='fontscale' class=no-width>").val(cmd.FontScale);
                let $link = $("<a>").addClass('flpobjref').text("handler ").click(function() {
                    flp_obj_view_history.unshift({
                        TypeArrayId: 3,
                        IdInThatTypeArray: cmd.FontHandler
                    });
                    flp_view_object_viewer();
                })
                rcmds.append($("<tr>").append($("<td>").text("Set font")).append($("<td>").append($link).append("#").append(fhi).append(" with scale ").append(fsi)));
                font = flpdata.Fonts[flpdata.GlobalHandlersIndexes[cmd.FontHandler].IdInThatTypeArray];
            }
            if (cmd.Flags & 4) {
                let bclri = $("<input type=text id='blendclr'>").val(JSON.stringify(cmd.BlendColor));
                rcmds.append($("<tr>").append($("<td>").text("Set blend color")).append($("<td>").append(bclri)));
            }
            let xoi = $("<input type=text id='xoffset'>").val(cmd.OffsetX);
            rcmds.append($("<tr>").append($("<td>").text("Set X offset")).append($("<td>").append(xoi)));
            let yoi = $("<input type=text id='yoffset'>").val(cmd.OffsetY);
            rcmds.append($("<tr>").append($("<td>").text("Set Y offset")).append($("<td>").append(yoi)));

            let str = cmd.Glyphs.reduce(function(str, glyph) {
                let char = font.CharNumberToSymbolIdMap.indexOf(glyph.GlyphId);
                if (flp.FontCharAliases) {
                    let map_chars = Object.keys(flp.FontCharAliases).filter(function(charString) {
                        return flp.FontCharAliases[charString] == char;
                    });
                    if (map_chars && map_chars.length !== 0) {
                        char = map_chars[0];
                    }
                }
                return str + (char > 0 ? String.fromCharCode(char) : ("$$" + glyph.GlyphId));
            }, '');

            rcmds.append($("<tr>").append($("<td>").text("Print glyphs")).append($("<td>").append($("<textarea>").val(str))));
            cmdsContainer.append(rcmds);
        }

        let open_preview_for_label = function(sl) {
            let u = new URLSearchParams();
            u.append('c', JSON.stringify(sl.RenderCommandsList));
            u.append('f', wad);
            u.append('r', tagid);

            let t = sl.Transformation;
            let m = t.Matrix;

            u.append('m', JSON.stringify([m[0], m[1], 0, 0, m[2], m[3], 0, 0, 0, 0, 1, 0, t.OffsetX, t.OffsetY, 0, 1]));
            window.open('/label.html?' + u, '_blank');
        }

        let get_label_from_table_tr = function(tr) {
            let sl = {
                'Transformation': JSON.parse(tr.find("td").last().find("textarea").last().val()),
                'RenderCommandsList': [],
            };

            let fontscale = 1.0;
            let fonthandler = -1;
            tr.find("table").each(function(cmdIndex, tbl) {
                let cmd = {
                    'Flags': 0
                };
                $(tbl).find("tr").each(function(i, row) {
                    let rname = $(row).find("td").first().text();
                    if (rname.includes("font")) {
                        cmd.Flags |= 8;
                        cmd.FontHandler = Number.parseInt($(row).find("#fonthandler").val());
                        cmd.FontScale = Number.parseFloat($(row).find("#fontscale").val());
                        fonthandler = cmd.FontHandler;
                        fontscale = cmd.FontScale;
                    } else if (rname.includes("blend")) {
                        cmd.Flags |= 4;
                        cmd.BlendColor = JSON.parse($(row).find("#blendclr").val());
                    } else if (rname.includes("X offset")) {
                        cmd.OffsetX = Number.parseFloat($(row).find("#xoffset").val());
                        if (Math.abs(cmd.OffsetX) > 0.000001) {
                            cmd.Flags |= 2;
                        }
                    } else if (rname.includes("Y offset")) {
                        cmd.OffsetY = Number.parseFloat($(row).find("#yoffset").val());
                        if (Math.abs(cmd.OffsetY) > 0.000001) {
                            cmd.Flags |= 1;
                        }
                    } else if (rname.includes("glyphs")) {
                        let text = $(row).find("textarea").val();
                        let glyphs = [];

                        let font = flpdata.Fonts[flpdata.GlobalHandlersIndexes[fonthandler].IdInThatTypeArray];
                        for (let char of text) {
                            let charCode = char.charCodeAt(0);
                            if (flp.FontCharAliases) {
                                if (flp.FontCharAliases.hasOwnProperty(charCode)) {
                                    charCode = flp.FontCharAliases[charCode];
                                }
                            }
                            let glyphId = font.CharNumberToSymbolIdMap[charCode];
                            let width = font.SymbolWidths[glyphId] * fontscale;
                            glyphs.push({
                                'GlyphId': glyphId,
                                'Width': width / 16
                            });
                        }
                        cmd.Glyphs = glyphs;
                    }
                });
                sl.RenderCommandsList.push(cmd);
            })
            return sl;
        }

        let btns = $("<div>");
        btns.append($("<button>peview original</button>").click(sl, function(e) {
            open_preview_for_label(e.data);
        }));
        btns.append($("<br>"));
        btns.append($("<button>preview changes</button>").click(function(e) {
            open_preview_for_label(get_label_from_table_tr($(this).parent().parent().parent()));
        }));
        btns.append($("<br>"));
        btns.append($("<button>apply changes</button>").click(iSl, function(e) {
            let sl = get_label_from_table_tr($(this).parent().parent().parent());

            $.post({
                url: getActionLinkForWadNode(wad, tagid, 'staticlabels'),
                data: {
                    'id': e.data,
                    'sl': JSON.stringify(sl)
                },
                success: function(a) {
                    if (a != "" && a.error) {
                        alert('Error uploading: ' + a.error);
                    } else {
                        alert('Success!');
                    }
                }
            });

        }));

        row.append($("<td>").append(cmdsContainer));
        row.append($("<td>").append(btns));

        let $transform = $("<textarea id='matrix'>").css('height', '12em').val(JSON.stringify(sl.Transformation, null, ' '));
        row.append($("<td>").append($transform));
        return row;
    }

    let flp_list_labels = function() {
        set3dVisible(false);
        dataSummary.empty();

        let table = $("<table class='staticlabelrendercommandlist'>");
        table.append($("<tr>").append($("<td>").text("Id")).append($("<td>").text("Render commands")));

        for (let iSl in flpdata.StaticLabels) {
            table.append(print_static_label_as_tr(iSl));
        }

        dataSummary.append(table);
    }

    let flp_view_object_viewer = function() {
        dataSummary.empty();
        gr_instance.cleanup();
        set3dVisible(false);
        let $history_element = $("<div>").css('margin', '7px').css('white-space', 'nowrap').css('overflow', 'hidden');
        let $data_element = $("<div>");

        let element_view = function(h) {
            $data_element.empty();
            if (h == undefined) {
                h = flp_obj_view_history[0];
            } else {
                flp_obj_view_history.unshift(h);
            }

            {
                $history_element.empty();
                $history_element.append($("<span>").text("History: ").css('padding', '6px'));
                let new_history = [h];
                for (let i in flp_obj_view_history) {
                    if (i != 0) {
                        if (flp_obj_view_history[i].IdInThatTypeArray != h.IdInThatTypeArray ||
                            flp_obj_view_history[i].TypeArrayId != h.TypeArrayId) {
                            new_history.push(flp_obj_view_history[i]);
                        }
                    }
                }
                flp_obj_view_history = new_history;
                if (flp_obj_view_history.length > 16) {
                    flp_obj_view_history.shift();
                }
                for (let i in flp_obj_view_history) {
                    let h = flp_obj_view_history[i];
                    let $a = $("<a>").text(objNamesArray[h.TypeArrayId] + "[" + h.IdInThatTypeArray + "] ");
                    $a.addClass('flpobjref').click(function() {
                        element_view(flp_obj_view_history[i]);
                    });
                    if (i == 0) {
                        $history_element.append(" > ", $a.css('color', 'white'), " <");
                    } else {
                        $history_element.append(" | ", $a);
                    }
                }
            }

            let obj = get_obj_by_handler(h);

            let _row = function() {
                return $("<tr>").append(Array.prototype.slice.call(arguments));
            }

            let _column = function() {
                return $("<td>").append(Array.prototype.slice.call(arguments));
            }

            let print_ref_handler = function(handler) {
                let $a = $("<a>").text('&' + objNamesArray[handler.TypeArrayId] + '[' + handler.IdInThatTypeArray + ']')
                $a.addClass('flpobjref');
                $a.click(function() {
                    element_view(handler);
                });
                switch (handler.TypeArrayId) {
                    case 1:
                        let mats = [];
                        let meshref = get_obj_by_handler(handler);
                        for (let i in meshref.Materials) {
                            let matname = meshref.Materials[i].TextureName;
                            if (matname != "") {
                                mats.push(matname);
                            }
                        }
                        if (mats.length != 0) {
                            return $("<div>").append($a, " (meshpart " + meshref.MeshPartIndex + ", textures: " + mats.join(",") + ")");
                        } else {
                            return $("<div>").append($a, " (meshpart " + meshref.MeshPartIndex + ", no textures used)");
                        }
                        break;
                    case 9:
                        let t = get_obj_by_handler(handler);
                        return $("<div>").append($a, " (x: ", t.OffsetX, " y: ", t.OffsetY, ")");
                    case 10:
                        let clr = get_obj_by_handler(handler).Color;
                        let css_rgb = "rgb(" + (clr[0] / 256.0) * 255 + "," + (clr[1] / 256.0) * 255 + "," + (clr[2] / 256.0) * 255;
                        let $rgb = $("<div>").addClass('flpcolorpreview').css('background-color', css_rgb);
                        let $rgba = $("<div>").addClass('flpcolorpreview').css('background-color', css_rgb).css('opacity', clr[3] / 256.0);
                        return $("<div>").append($a, " (without alpha: ", $rgb, " with alpha: ", $rgba, "  a: ", clr[3], ")");
                        break;
                }
                return $a;
            }

            let print_ref_handler_index = function(handler_index) {
                if (flpdata.GlobalHandlersIndexes[handler_index]) {
                    return print_ref_handler(flpdata.GlobalHandlersIndexes[handler_index]);
                } else {
                    return "%bad handler index " + handler_index + "%";
                }
            }

            let $data_table = $("<table>");

            let print_script = function(script) {
                if (script) {
                    let code = script.Decompiled;
                    let $code_element = $("<div style='white-space: pre;'>").text(" > click to show decompiled script < ").css('cursor', 'pointer').click(function() {
                        $(this).empty().css('cursor', '').append(code.join('<br>')).off('click');
                    })
                    return $code_element;
                } else {
                    return $("<div>").text("not implemented");
                }
            }

            let print_data6 = function() {
                print_data6_subtype1(obj.Sub1);
                let $events = $("<div>");

                let $events_table = $("<table>");
                for (let i in obj.Sub2s) {
                    let ev = obj.Sub2s[i]
                    let $event_table = $("<table>");
                    $event_table.append(
                        _row(_column("Mask"), _column(ev.EventKeysMask)),
                        _row(_column("Mask2"), _column(ev.EventUnkMask)),
                        _row(_column("Script"), _column(print_script(ev.Script))),
                    );
                    $events_table.append(_row(_column("event" + i), _column($event_table)));
                }
                $data_table.append(_row(_column("events"), _column($events_table)));
            }

            let print_data6_subtype1 = function(obj) {
                let $elements_table = $("<table>");
                let $scripts_table = $("<table>");

                for (let i in obj.ElementsAnimation) {
                    let el = obj.ElementsAnimation[i];
                    let $el = $("<div>");

                    let $frames_table = $("<table>");
                    for (let j in el.KeyFrames) {
                        let frame = el.KeyFrames[j];
                        let $frame = $("<table>");
                        $frame.append(_row(_column("name"), _column(frame.Name)));
                        $frame.append(_row(_column("frame end time"), _column(frame.WhenThisFrameEnds)));
                        $frame.append(_row(_column("element"), _column(print_ref_handler(frame.ElementHandler))));
                        $frame.append(_row(_column("color"), _column(print_ref_handler({
                            TypeArrayId: 10,
                            IdInThatTypeArray: frame.ColorId
                        }))));
                        $frame.append(_row(_column("transformation"), _column(print_ref_handler({
                            TypeArrayId: 9,
                            IdInThatTypeArray: frame.TransformationId
                        }))));

                        $frames_table.append(_row(_column("frame " + j), _column($frame)));
                    }
                    $el.append($frames_table);

                    $elements_table.append(_row(_column("element " + i), _column($el)));
                }

                for (let i in obj.FrameScriptLables) {
                    let script = obj.FrameScriptLables[i];
                    let $script = $("<div>");

                    $script.append(_row(_column("triggered after frame"), _column(script.TriggerFrameNumber)));
                    $script.append(_row(_column("name"), _column(script.LabelName)));
                    let $streams_table = $("<table>");
                    for (let iStream in script.Subs) {
                        $streams_table.append(_row(_column(print_script(script.Subs[iStream].Script))));
                    }
                    $script.append(_row(_column("threads"), _column($streams_table)));

                    $scripts_table.append(_row(_column("script " + i), _column($script)));
                }

                $data_table.append(_row(_column("elements"), _column($elements_table)), _row(_column("methods"), _column($scripts_table)));
            }

            let print_mesh = function(obj) {
                $data_table.append(_row(_column("Mesh part index "),
                    _column("<b>" + obj.MeshPartIndex + "</b><br><sub>You can open related MDL_%flpname% resource and check this object part (mesh that index starts with o_" + obj.MeshPartIndex + "_g0_...) </sub>")));
                let $materials = [];
                for (let i in obj.Materials) {
                    // console.log(obj.Materials, obj, flp);
                    let mat = obj.Materials[i];
                    let $mat = $("<div>");
                    $mat.append("Color: <b>0x" + mat.Color.toString(16) + "</b><br>");
                    $mat.append("Texture name: <b>" + mat.TextureName + "</b><br>");
                    if (mat.TextureName != "") {
                        $mat.append($('<img>').addClass('no-interpolate').attr('src', 'data:image/png;base64,' + flp.Textures[mat.TextureName].Images[0].Image));
                    }
                    $materials.push(_row(_column("material " + i), _column($mat)));
                }
                $data_table.append($materials);
            }

            let print_transform = function(obj) {
                let $form = $("<div>");
                $data_table.append(_row(_column("Offset X"), _column($("<input id='x' type='text'>").val(obj.OffsetX))));
                $data_table.append(_row(_column("Offset Y"), _column($("<input id='y' type='text'>").val(obj.OffsetY))));
                let $matrix = $("<textarea id='matrix'>").css('height', '8em').val(JSON.stringify(obj.Matrix, null, ' '));
                $matrix.append("<sub>You can read about 2d matrices <a href='https://en.wikipedia.org/wiki/Transformation_matrix#Examples_in_2D_computer_graphics'>there</a></sub>")
                $data_table.append(_row(_column("Matrix"), _column($matrix)));
                let $submit = $("<button>").text("Update resource").click(function() {
                    $table = $(this).parent().parent().parent();
                    let newTransform = {
                        OffsetX: Number.parseFloat($table.find("#x").val()),
                        OffsetY: Number.parseFloat($table.find("#y").val()),
                        Matrix: JSON.parse($table.find("#matrix").val()),
                    };
                    $.post({
                        url: getActionLinkForWadNode(wad, tagid, 'transform'),
                        data: {
                            'id': h.IdInThatTypeArray,
                            'data': JSON.stringify(newTransform),
                        },
                        success: function(a) {
                            if (a != "" && a.error) {
                                alert('Error uploading: ' + a.error);
                            } else {
                                flpdata.Transformations[h.IdInThatTypeArray] = newTransform;
                                alert('Success!');
                            }
                        }
                    });
                })
                let warning = ("<sub>You can miss changes in web interface, but they must appear on disk</sub>")
                $data_table.append(_row(_column(), _column($submit, warning)));
            }

            switch (h.TypeArrayId) {
                default:
                    $data_table.append(JSON.stringify(obj));
                    break;
                case 1:
                    print_mesh(obj);
                    break;
                case 4:
                    $data_table.append(print_static_label_as_tr(h.IdInThatTypeArray), false);
                    break;
                case 6:
                    print_data6(obj);
                    break;
                case 7:
                    print_data6_subtype1(obj);
                    break;
                case 8:
                    print_data6_subtype1(obj);
                    break;
                case 9:
                    print_transform(obj);
                    break;
            }

            let get_parents = function(child_h) {
                let parents = [];
                if (child_h.TypeArrayId == 8) {
                    return parents;
                }
                let check_parenting = function(parent, h) {
                    if (h.IdInThatTypeArray == child_h.IdInThatTypeArray && h.TypeArrayId == child_h.TypeArrayId) {
                        let already = false;
                        for (let i in parents) {
                            if (parent.IdInThatTypeArray == parents[i].IdInThatTypeArray && parent.TypeArrayId == parents[i].TypeArrayId) {
                                already = true;
                            }
                        }
                        if (!already) {
                            parents.push(parent);
                        }
                    }
                }
                let parse_parenting_data6_sub1 = function(h, o) {
                    for (let anim of o.ElementsAnimation) {
                        for (let frame of anim.KeyFrames) {
                            check_parenting(h, frame.ElementHandler);
                            check_parenting(h, {
                                TypeArrayId: 9,
                                IdInThatTypeArray: frame.TransformationId
                            });
                            check_parenting(h, {
                                TypeArrayId: 10,
                                IdInThatTypeArray: frame.ColorId
                            });
                        }
                    }
                }
                for (let h of flpdata.GlobalHandlersIndexes) {
                    let o = get_obj_by_handler(h);

                    switch (h.TypeArrayId) {
                        case 4:
                            for (let rc of o.RenderCommandsList) {
                                if (rc.Flags & 8 != 0) {
                                    check_parenting(h, {
                                        TypeArrayId: 3,
                                        IdInThatTypeArray: rc.FontHandler
                                    });
                                }
                            }
                            break;
                        case 5:
                            check_parenting(h, o.FontHandler);
                            break;
                        case 6:
                            parse_parenting_data6_sub1(h, o.Sub1);
                            break;
                        case 7:
                            parse_parenting_data6_sub1(h, o);
                            break;
                        case 8:
                            parse_parenting_data6_sub1(h, o);
                            break;
                    }
                }
                parse_parenting_data6_sub1({
                    TypeArrayId: 8,
                    IdInThatTypeArray: 0
                }, flpdata.Data8);
                return parents;
            }

            let $table = $("<table>");

            let $header = $("<span>").text(" Viewing object " + objNamesArray[h.TypeArrayId] + "[" + h.IdInThatTypeArray + "]");

            let parents_list = [];
            let parents = get_parents(h);
            let curParentRow = _row();
            let colums_cnt = 6;
            for (let i in parents) {
                if (i != 0 && (i % colums_cnt == 0)) {
                    parents_list.push(curParentRow);
                    curParentRow = _row().attr('colspan', colums_cnt);
                }
                curParentRow.append(_column(print_ref_handler(parents[i])));
            }
            if (parents.length < colums_cnt || (parents.length % colums_cnt != 0)) {
                parents_list.push(curParentRow);
            }

            $table.append(_row(_column($header).attr('colspan', colums_cnt + 1)));
            if (parents.length != 0) {
                $table.append(_row(_column("parents").attr('rowspan', parents_list.length + 1)), parents_list);
            } else {
                $table.append(_row(_column("parents"), _column("no parents found")));
            }

            let $renderButton = $("<a class='flpobjref'>").click(function() {
                object_renderer_handler = h;
                flp_view_object_renderer();
            }).text('render');
            $table.append(_row(_column($renderButton).attr('colspan', colums_cnt + 1)));

            if (h.TypeArrayId != 8) {
                let $nav_row = _row();
                let arr = get_obj_arr_by_id(h.TypeArrayId);
                if (h.IdInThatTypeArray > 0 || h.IdInThatTypeArray + 1 < arr.length) {
                    if (h.IdInThatTypeArray > 0) {
                        $nav_row.append(_column("Prev:"));
                        $nav_row.append(_column(print_ref_handler({
                            TypeArrayId: h.TypeArrayId,
                            IdInThatTypeArray: h.IdInThatTypeArray - 1,
                        })));
                    }
                    if (h.IdInThatTypeArray + 1 < arr.length) {
                        $nav_row.append(_column("Next:"));
                        $nav_row.append(_column(print_ref_handler({
                            TypeArrayId: h.TypeArrayId,
                            IdInThatTypeArray: h.IdInThatTypeArray + 1,
                        })));
                    }
                    $table.append(_row(_column("nav"), _column($("<table>").append($nav_row))));
                }
            }

            $table.append(_row(_column($data_table).attr('colspan', colums_cnt + 1)));
            $data_element.append($table);
            $('#view-summary .view-item-container').animate({
                scrollTop: 0
            }, 200);
        }
        dataSummary.append($history_element, $data_element);
        element_view();
    }

    let flp_view_font = function() {
        gr_instance.cleanup();
        set3dVisible(true);
        gr_instance.setInterfaceCameraMode(true);
        dataSummary.empty();

        let importBMFontScale = $('<input id="importbmfontscale" type="number" min="0" max="20" value="1" step="0.1">');
        let importBMFontInput = $('<button>');
        importBMFontInput.text('Import glyphs from BMFont file');
        importBMFontInput.attr("href", getActionLinkForWadNode(wad, tagid, 'importbmfont')).click(function() {
            $(this).attr('href', getActionLinkForWadNode(wad, tagid, 'importbmfont', 'scale=' + $("#importbmfontscale").val()));
            console.log($(this).attr('href'));
            uploadAjaxHandler.call(this);
        });
        let importDiv = $('<div id="flpimportfont">');
        importDiv.append($('<label>').text('font scale').append(importBMFontScale));
        importDiv.append(importBMFontInput);
        importDiv.append($('<a>').text('Link to usage instruction').attr('target', '_blank')
            .attr('href', 'https://github.com/mogaika/god_of_war_browser/blob/master/LOCALIZATION.md'));
        dataSummary.append(importDiv);

        let charstable = $("<table>");

        let mdl = new RenderModel();
        let matmap = {};

        for (let iFont in flpdata.Fonts) {
            let font = flpdata.Fonts[iFont];
            charstable.append($("<tr>").append("font: " + iFont));
            charstable.append($("<tr>").append("reversed map (utf-16): " + !(font.Flags & 1)));

            for (let iChar in font.CharNumberToSymbolIdMap) {
                if (font.CharNumberToSymbolIdMap[iChar] == -1) {
                    continue;
                }

                let glyphId = font.CharNumberToSymbolIdMap[iChar];
                let char = iChar;

                if (!(font.Flags & 1)) {
                    char = glyphId;
                    glyphId = iChar;
                }

                if (glyphId >= font.CharsCount) {
                    continue;
                }

                let chrdata = font.MeshesRefs[glyphId];

                let meshes = [];
                if (chrdata.MeshPartIndex !== -1) {
                    meshes = loadMeshPartFromAjax(mdl, flp.Model.Meshes[0], chrdata.MeshPartIndex);
                    let txrid = undefined;
                    if (chrdata.Materials && chrdata.Materials.length !== 0 && chrdata.Materials[0].TextureName) {
                        let txr_name = chrdata.Materials[0].TextureName;

                        if (!matmap.hasOwnProperty(txr_name) &&
                            flp.Textures.hasOwnProperty(txr_name) &&
                            flp.Textures[txr_name].Images.length !== 0 &&
                            flp.Textures[txr_name].Images[0].hasOwnProperty('Image')) {
                            let img = flp.Textures[txr_name].Images[0].Image;

                            let material = new RenderMaterial();

                            let texture = new RenderTexture('data:image/png;base64,' + img);
                            texture.markAsFontTexture();

                            let layer = new RenderMaterialLayer();
                            layer.setTextures([texture]);
                            material.addLayer(layer);

                            matmap[txr_name] = mdl.materials.length;
                            mdl.addMaterial(material);
                        }
                        txrid = matmap[txr_name];
                    }
                    for (let iMesh in meshes) {
                        meshes[iMesh].setMaterialID(txrid);
                    }
                }

                let symbolWidth = font.SymbolWidths[glyphId];
                let cubemesh = RenderHelper.CubeLinesMesh(symbolWidth / 32, 0, 0, symbolWidth / 32, 500, 5, false);
                mdl.addMesh(cubemesh);
                meshes.push(cubemesh);

                let charS = String.fromCharCode(char);

                if (flp.FontCharAliases) {
                    let map_chars = Object.keys(flp.FontCharAliases).filter(function(charUnicode) {
                        return flp.FontCharAliases[charUnicode] == char
                    });
                    if (map_chars && map_chars.length !== 0) {
                        charS = String.fromCharCode(map_chars[0]);
                    }
                }

                let table = $("<table>");

                let tr1 = $("<tr>");
                let tr2 = $("<tr>");
                tr1.append($("<td>").text('#' + glyphId));
                tr1.append($("<td>").text('width ' + symbolWidth));
                tr1.append($("<td>").text('ansii ' + char));
                tr2.append($("<td>").append($("<h2>").text(charS)));
                tr2.append($("<td>").text('mesh pt ' + chrdata.MeshPartIndex));

                table.mouseenter([mdl, meshes], function(ev) {
                    ev.data[0].showExclusiveMeshes(ev.data[1]);
                    gr_instance.flushScene();
                    gr_instance.requestRedraw();
                });

                charstable.append($("<tr>").append(table.append(tr1).append(tr2)));
            }
        }

        dataSummary.append(charstable);
        gr_instance.addNode(new ObjectTreeNodeModel("flp_font", mdl));
        gr_instance.requestRedraw();
    }

    let flp_view_object_renderer = function() {
        let h = object_renderer_handler;
        object_renderer_frame = 0;

        dataSummary.empty();

        let o = get_obj_by_handler(h);

        switch (h.TypeArrayId) {
            case 6:
                o = o.Sub1;
                break;
            case 7:
            case 8:
                break;
            default:
                dataSummary.append("Invalid object type for rendering");
                break;
        }

        set3dVisible(true);
        gr_instance.setInterfaceCameraMode(true);

        let frames_amount = o.hasOwnProperty('TotalFramesCount') ? o.TotalFramesCount : 1;

        dataSummary.append("Rendering object ");
        let $a = $("<a>").text(objNamesArray[h.TypeArrayId] + "[" + h.IdInThatTypeArray + "] ");
        $a.addClass('flpobjref').click(function() {
            flp_obj_view_history.unshift(h);
            flp_view_object_viewer();
        });
        dataSummary.append($("Rendering object "));

        let f = new gowFlp(flp);

        let $currentFrame = $("<p>");

        let renderFrame = function(frame) {
            if (frame === undefined) {
                frame = object_renderer_frame;
            } else if (frame == object_renderer_frame) {
                return;
            }
            $currentFrame.text("Current frame " + frame + " / " + frames_amount);
            object_renderer_frame = frame;

            f.claimTextures();

            gr_instance.cleanup();

            let elementsRenderModels = f.renderElementByHandler(object_renderer_handler, object_renderer_frame);
            for (const node of elementsRenderModels) {
                gr_instance.addNode(node);
            }
            // console.log("Rendered frame", frame);

            gr_instance.flushScene();
            gr_instance.requestRedraw();

            f.unclaimTextures();
        }


        dataSummary.append($a);
        $rangeInput = $('<input type="range" min="0" value="0">').attr("max", frames_amount - 1);

        $rangeInput.on('input', function(ev) {
            let newFrame = parseInt(this.value);
            this.value = newFrame;
            if (gr_instance.frameChecker == 0) {
                if (newFrame != object_renderer_frame) {
                    renderFrame(newFrame);
                    gr_instance.frameChecker = 1;
                }
            } else {
                console.warn("skipping frames");
            }
        });

        dataSummary.append($("<div>").append($currentFrame));
        dataSummary.append($("<div>").append($rangeInput));

        renderFrame();
    }
        let flp_hud_stage_editor = function() {
            set3dVisible(false);
            gr_instance.cleanup();
            dataSummary.empty();

            let state = {
                timeline: 'root',
                frame: 0,
                zoom: 1.0,
                invertY: true,
                cloneTransformOnDrag: true,
                selectedKey: null,
                selectedItem: null,
                visibleItems: [],
                drag: null,
                patchLog: [],
            };

            let imageCache = {};

            function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
            function n(v, def) { v = Number.parseFloat(v); return Number.isFinite(v) ? v : def; }
            function handlerName(h) {
                if (!h) { return 'null handler'; }
                let name = (objNamesArray && objNamesArray[h.TypeArrayId]) ? objNamesArray[h.TypeArrayId] : ('Type ' + h.TypeArrayId);
                return name + '[' + h.IdInThatTypeArray + ']';
            }
            function getHandlerObjSafe(h) {
                if (!h) { return undefined; }
                if (h.TypeArrayId == 8) { return flpdata.Data8; }
                let arr = get_obj_arr_by_id(h.TypeArrayId);
                if (!arr) { return undefined; }
                return arr[h.IdInThatTypeArray];
            }
            function transformName(id) { return 'Transform[' + id + ']'; }
            function colorName(id) { return 'Color[' + id + ']'; }
            function timelineOptions() {
                let out = [{ id: 'root', label: 'ROOT / Data8', handler: { TypeArrayId: 8, IdInThatTypeArray: 0 }, node: flpdata.Data8 }];
                for (let i = 0; i < flpdata.Datas7.length; i++) {
                    out.push({ id: 'd7:' + i, label: 'Datas7[' + i + ']', handler: { TypeArrayId: 7, IdInThatTypeArray: i }, node: flpdata.Datas7[i] });
                }
                for (let i = 0; i < flpdata.Datas6.length; i++) {
                    out.push({ id: 'd6:' + i, label: 'Datas6[' + i + '].Sub1', handler: { TypeArrayId: 6, IdInThatTypeArray: i }, node: flpdata.Datas6[i].Sub1 });
                }
                return out;
            }
            function currentTimeline() {
                let opts = timelineOptions();
                for (let o of opts) { if (o.id == state.timeline) { return o; } }
                return opts[0];
            }
            function identityTransform() { return { x: 0, y: 0, a: 1, b: 0, c: 0, d: 1 }; }
            function compose2d(parent, t) {
                if (!t) { return parent; }
                let m = t.Matrix || [1, 0, 0, 1];
                let ox = n(t.OffsetX, 0), oy = n(t.OffsetY, 0);
                return {
                    a: parent.a * m[0] + parent.c * m[1],
                    b: parent.b * m[0] + parent.d * m[1],
                    c: parent.a * m[2] + parent.c * m[3],
                    d: parent.b * m[2] + parent.d * m[3],
                    x: parent.x + parent.a * ox + parent.c * oy,
                    y: parent.y + parent.b * ox + parent.d * oy,
                };
            }
            function composeColor(parent, colorId) {
                let c = flpdata.BlendColors[colorId];
                if (!c || !c.Color) { return parent.slice(); }
                return [parent[0] * (c.Color[0] / 256.0), parent[1] * (c.Color[1] / 256.0), parent[2] * (c.Color[2] / 256.0), parent[3] * (c.Color[3] / 256.0)];
            }
            function keyForItem(path, elemIndex, keyIndex) { return path + '/e' + elemIndex + '/k' + keyIndex; }
            function currentKeyFrame(anim, frame) {
                if (!anim || !anim.KeyFrames || anim.KeyFrames.length == 0) { return null; }
                for (let i = 0; i < anim.KeyFrames.length; i++) {
                    if (frame <= anim.KeyFrames[i].WhenThisFrameEnds) { return { key: anim.KeyFrames[i], index: i }; }
                }
                return { key: anim.KeyFrames[anim.KeyFrames.length - 1], index: anim.KeyFrames.length - 1 };
            }
            function firstTextureNameForHandler(h) {
                let obj = getHandlerObjSafe(h);
                if (!obj) { return ''; }
                if (h.TypeArrayId == 1 && obj.Materials) {
                    for (let mat of obj.Materials) { if (mat.TextureName) { return mat.TextureName; } }
                }
                return '';
            }
            function getTextureImage(name) {
                if (!name || !flp.Textures || !flp.Textures[name] || !flp.Textures[name].Images || !flp.Textures[name].Images.length) { return null; }
                if (!imageCache[name]) {
                    let img = new Image();
                    img.src = 'data:image/png;base64,' + flp.Textures[name].Images[0].Image;
                    imageCache[name] = img;
                }
                return imageCache[name];
            }
            function getDisplayLabel(h, key) {
                let obj = getHandlerObjSafe(h);
                if (!obj) { return handlerName(h); }
                if (h.TypeArrayId == 1) {
                    let tx = firstTextureNameForHandler(h);
                    return 'MeshPart ' + obj.MeshPartIndex + (tx ? ' / ' + tx : '');
                }
                if (h.TypeArrayId == 5) { return 'DynLabel ' + (obj.ValueName || obj.Placeholder || h.IdInThatTypeArray); }
                if (h.TypeArrayId == 4) { return 'StaticLabel ' + h.IdInThatTypeArray; }
                if (h.TypeArrayId == 6 || h.TypeArrayId == 7 || h.TypeArrayId == 8) { return handlerName(h) + ' timeline'; }
                return key && key.Name ? key.Name : handlerName(h);
            }
            function collectItemsFromTimeline(node, handler, frame, parentTransform, parentColor, path, depth) {
                let out = [];
                if (!node || !node.ElementsAnimation || depth > 12) { return out; }
                for (let i = 0; i < node.ElementsAnimation.length; i++) {
                    let anim = node.ElementsAnimation[i];
                    let kf = currentKeyFrame(anim, frame);
                    if (!kf || !kf.key) { continue; }
                    let key = kf.key;
                    let worldT = compose2d(parentTransform, flpdata.Transformations[key.TransformationId]);
                    let worldC = composeColor(parentColor, key.ColorId);
                    let item = { id: keyForItem(path, i, kf.index), path: path, elementIndex: i, keyIndex: kf.index, parentHandler: handler, keyFrame: key, elementHandler: key.ElementHandler, transformId: key.TransformationId, colorId: key.ColorId, world: worldT, color: worldC, label: getDisplayLabel(key.ElementHandler, key), depth: depth };
                    out.push(item);
                    let child = getHandlerObjSafe(key.ElementHandler);
                    if (key.ElementHandler.TypeArrayId == 6 && child && child.Sub1) {
                        out = out.concat(collectItemsFromTimeline(child.Sub1, key.ElementHandler, frame, worldT, worldC, item.id, depth + 1));
                    } else if ((key.ElementHandler.TypeArrayId == 7 || key.ElementHandler.TypeArrayId == 8) && child) {
                        out = out.concat(collectItemsFromTimeline(child, key.ElementHandler, frame, worldT, worldC, item.id, depth + 1));
                    }
                }
                return out;
            }
            function collectVisibleItems() {
                let tl = currentTimeline();
                state.visibleItems = collectItemsFromTimeline(tl.node, tl.handler, state.frame, identityTransform(), [1, 1, 1, 1], tl.id, 0);
                if (state.selectedKey && !state.visibleItems.find(i => i.id == state.selectedKey)) { state.selectedKey = null; state.selectedItem = null; }
                if (state.selectedKey) { state.selectedItem = state.visibleItems.find(i => i.id == state.selectedKey); }
            }
            function transformUsageCount(transformId) {
                let count = 0;
                function scanNode(node) {
                    if (!node || !node.ElementsAnimation) { return; }
                    for (let anim of node.ElementsAnimation) { for (let k of anim.KeyFrames) { if (k.TransformationId == transformId) { count++; } } }
                }
                for (let d of flpdata.Datas6) { scanNode(d.Sub1); }
                for (let d of flpdata.Datas7) { scanNode(d); }
                scanNode(flpdata.Data8);
                return count;
            }
            function cloneTransformForSelected() {
                if (!state.selectedItem) { return; }
                let key = state.selectedItem.keyFrame;
                let oldId = key.TransformationId;
                let src = flpdata.Transformations[oldId];
                if (!src) { return; }
                flpdata.Transformations.push(JSON.parse(JSON.stringify(src)));
                key.TransformationId = flpdata.Transformations.length - 1;
                state.selectedItem.transformId = key.TransformationId;
                state.patchLog.push('clone transform ' + oldId + ' -> ' + key.TransformationId + ' for ' + state.selectedItem.id);
            }
            function ensureEditableTransformForSelected() {
                if (state.selectedItem && state.cloneTransformOnDrag && transformUsageCount(state.selectedItem.transformId) > 1) { cloneTransformForSelected(); }
            }
            function canvasToWorld(canvas, x, y) {
                let rect = canvas.getBoundingClientRect();
                let cx = (x - rect.left) * (canvas.width / rect.width);
                let cy = (y - rect.top) * (canvas.height / rect.height);
                let wx = (cx - canvas.width / 2) / state.zoom;
                let wy = (cy - canvas.height / 2) / state.zoom;
                if (state.invertY) { wy = -wy; }
                return { x: wx, y: wy };
            }
            function worldToCanvas(canvas, x, y) {
                let cy = state.invertY ? -y : y;
                return { x: canvas.width / 2 + x * state.zoom, y: canvas.height / 2 + cy * state.zoom };
            }
            function itemSize(it) {
                let t = it.elementHandler.TypeArrayId;
                if (t == 5) { return { w: 160, h: 28 }; }
                if (t == 4) { return { w: 130, h: 28 }; }
                if (t == 6 || t == 7 || t == 8) { return { w: 95, h: 34 }; }
                return { w: 70, h: 40 };
            }
            function hitTest(canvas, ev) {
                let rect = canvas.getBoundingClientRect();
                let x = (ev.clientX - rect.left) * (canvas.width / rect.width);
                let y = (ev.clientY - rect.top) * (canvas.height / rect.height);
                for (let i = state.visibleItems.length - 1; i >= 0; i--) {
                    let it = state.visibleItems[i];
                    let p = worldToCanvas(canvas, it.world.x, it.world.y);
                    let s = itemSize(it);
                    if (x >= p.x - s.w / 2 && x <= p.x + s.w / 2 && y >= p.y - s.h / 2 && y <= p.y + s.h / 2) { return it; }
                }
                return null;
            }
            function drawStage() {
                collectVisibleItems();
                let canvas = $('#flp-hud-stage')[0];
                if (!canvas) { return; }
                let ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#3c3f41';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = 'rgba(255,0,0,.55)'; ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
                ctx.strokeStyle = 'rgba(0,255,80,.55)'; ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();
                ctx.font = '12px monospace'; ctx.textBaseline = 'top';
                for (let it of state.visibleItems) {
                    let p = worldToCanvas(canvas, it.world.x, it.world.y);
                    let sz = itemSize(it);
                    let rgba = 'rgba(' + Math.round(clamp(it.color[0], 0, 1) * 255) + ',' + Math.round(clamp(it.color[1], 0, 1) * 255) + ',' + Math.round(clamp(it.color[2], 0, 1) * 255) + ',' + clamp(it.color[3], 0.15, 1) + ')';
                    let selected = state.selectedKey == it.id;
                    ctx.save(); ctx.translate(p.x, p.y);
                    ctx.strokeStyle = selected ? '#ffff00' : 'rgba(255,255,255,.65)'; ctx.lineWidth = selected ? 3 : 1; ctx.fillStyle = rgba;
                    let img = getTextureImage(firstTextureNameForHandler(it.elementHandler));
                    if (img && img.complete && it.elementHandler.TypeArrayId == 1) { ctx.globalAlpha = clamp(it.color[3], 0.25, 1); ctx.drawImage(img, -sz.w / 2, -sz.h / 2, sz.w, sz.h); ctx.globalAlpha = 1; } else { ctx.fillRect(-sz.w / 2, -sz.h / 2, sz.w, sz.h); }
                    ctx.strokeRect(-sz.w / 2, -sz.h / 2, sz.w, sz.h);
                    ctx.fillStyle = selected ? '#ffff00' : '#ffffff'; ctx.fillText(it.label.substring(0, 32), -sz.w / 2 + 3, -sz.h / 2 + 3);
                    ctx.restore();
                }
                renderElementList(); renderInspector();
            }
            function renderElementList() {
                let list = $('#flp-hud-elements').empty();
                for (let it of state.visibleItems) {
                    let row = $('<div>').css({ padding: '4px', cursor: 'pointer', borderBottom: '1px solid #222', color: state.selectedKey == it.id ? '#ffff80' : '#ddd' });
                    row.text(it.id + ' | ' + it.label + ' | ' + transformName(it.transformId) + ' | ' + colorName(it.colorId));
                    row.click(function() { state.selectedKey = it.id; state.selectedItem = it; drawStage(); });
                    list.append(row);
                }
            }
            function renderInspector() {
                let box = $('#flp-hud-inspector').empty();
                if (!state.selectedItem) { box.text('Selecione um elemento no stage/lista.'); return; }
                let it = state.selectedItem, key = it.keyFrame;
                let tr = flpdata.Transformations[key.TransformationId];
                let col = flpdata.BlendColors[key.ColorId];
                function inputRow(label, input) { return $('<div>').css({ margin: '4px 0' }).append($('<label>').css({ display: 'inline-block', width: '130px' }).text(label), input); }
                box.append($('<h3>').text(it.label), $('<div>').text('Handler: ' + handlerName(key.ElementHandler)), $('<div>').text('Keyframe: ' + it.id), $('<div>').text('Uso do transform: ' + transformUsageCount(key.TransformationId) + ' keyframe(s)'));
                box.append(inputRow('Name', $('<input type="text">').val(key.Name || '').on('change', function() { key.Name = this.value; state.patchLog.push('set key name ' + it.id); })));
                box.append(inputRow('Frame end', $('<input type="number">').val(key.WhenThisFrameEnds).on('change', function() { key.WhenThisFrameEnds = Number.parseInt(this.value) || 0; state.patchLog.push('set frame end ' + it.id); drawStage(); })));
                box.append(inputRow('TransformId', $('<input type="number">').val(key.TransformationId).on('change', function() { key.TransformationId = clamp(Number.parseInt(this.value) || 0, 0, flpdata.Transformations.length - 1); state.patchLog.push('set transform id ' + it.id); drawStage(); })));
                box.append(inputRow('ColorId', $('<input type="number">').val(key.ColorId).on('change', function() { key.ColorId = clamp(Number.parseInt(this.value) || 0, 0, flpdata.BlendColors.length - 1); state.patchLog.push('set color id ' + it.id); drawStage(); })));
                if (tr) {
                    box.append(inputRow('OffsetX', $('<input type="number" step="0.0625">').val(tr.OffsetX).on('change', function() { tr.OffsetX = n(this.value, tr.OffsetX); state.patchLog.push('set OffsetX ' + key.TransformationId); drawStage(); })));
                    box.append(inputRow('OffsetY', $('<input type="number" step="0.0625">').val(tr.OffsetY).on('change', function() { tr.OffsetY = n(this.value, tr.OffsetY); state.patchLog.push('set OffsetY ' + key.TransformationId); drawStage(); })));
                    box.append(inputRow('Matrix[4]', $('<textarea>').css({ width: '95%', height: '70px' }).val(JSON.stringify(tr.Matrix)).on('change', function() { try { let m = JSON.parse(this.value); if (m.length == 4) { tr.Matrix = m.map(Number); state.patchLog.push('set matrix ' + key.TransformationId); drawStage(); } } catch (e) { alert('Matrix JSON inválida: ' + e); } })));
                    box.append($('<button>').text('Clone transform agora').click(function() { cloneTransformForSelected(); drawStage(); }));
                }
                if (col && col.Color) {
                    let colorLine = $('<div>').css({ marginTop: '8px' }).append('RGBA 0..256: ');
                    for (let i = 0; i < 4; i++) { colorLine.append($('<input type="number" min="0" max="256">').css({ width: '55px' }).val(col.Color[i]).on('change', function() { col.Color[i] = clamp(Number.parseInt(this.value) || 0, 0, 256); state.patchLog.push('set color ' + key.ColorId); drawStage(); })); }
                    box.append(colorLine);
                }
            }
            function collectScripts() {
                let out = [];
                function addScript(label, s) { if (s && s.Decompiled) { out.push({ label: label, script: s }); } }
                function scanSub1(prefix, node) {
                    if (!node || !node.FrameScriptLables) { return; }
                    for (let i = 0; i < node.FrameScriptLables.length; i++) {
                        let lbl = node.FrameScriptLables[i];
                        for (let j = 0; j < lbl.Subs.length; j++) { addScript(prefix + '.FrameScriptLables[' + i + '] ' + (lbl.LabelName || '') + '.Subs[' + j + ']', lbl.Subs[j].Script); }
                    }
                }
                for (let i = 0; i < flpdata.Datas6.length; i++) { scanSub1('Datas6[' + i + '].Sub1', flpdata.Datas6[i].Sub1); for (let j = 0; j < flpdata.Datas6[i].Sub2s.length; j++) { addScript('Datas6[' + i + '].Sub2s[' + j + '] event', flpdata.Datas6[i].Sub2s[j].Script); } }
                for (let i = 0; i < flpdata.Datas7.length; i++) { scanSub1('Datas7[' + i + ']', flpdata.Datas7[i]); }
                scanSub1('Data8 ROOT', flpdata.Data8);
                return out;
            }
            function renderScriptEditor(container) {
                container.empty();
                let scripts = collectScripts();
                let sel = $('<select>').css({ width: '100%' });
                for (let i = 0; i < scripts.length; i++) { sel.append($('<option>').val(i).text(i + ' | ' + scripts[i].label)); }
                let area = $('<textarea>').css({ width: '100%', height: '330px', fontFamily: 'monospace' });
                function load() { let s = scripts[Number.parseInt(sel.val())]; area.val(s ? s.script.Decompiled.join('\n') : ''); }
                sel.on('change', load);
                area.on('change', function() { let s = scripts[Number.parseInt(sel.val())]; if (s) { s.script.Decompiled = area.val().split(/\r?\n/).filter(x => x.trim().length); state.patchLog.push('edit script ' + s.label); } });
                let ops = $('<div>').css({ margin: '6px 0' });
                ['00: end', 'Play', 'Stop', 'GotoFrame ', 'GotoLabel ', 'CallFrame ', 'push_string ""'].forEach(function(op) { ops.append($('<button>').text(op).click(function() { area.val(area.val() + (area.val().endsWith('\n') ? '' : '\n') + op); area.trigger('change'); })); });
                container.append($('<h3>').text('Scripts / Decompiled opcodes'), sel, ops, area);
                load();
            }
            function renderDynamicLabels(container) {
                container.empty();
                let table = $('<table>').css({ width: '100%' });
                table.append($('<tr>').append('<th>ID</th><th>ValueName</th><th>Placeholder</th><th>FontHandler</th><th>Width1</th><th>BlendColor ARGB</th><th>Limit</th>'));
                for (let i = 0; i < flpdata.DynamicLabels.length; i++) {
                    let d = flpdata.DynamicLabels[i];
                    function inp(prop, width) { return $('<input>').css({ width: width || '120px' }).val(d[prop]).on('change', function() { d[prop] = (typeof d[prop] == 'number') ? Number.parseInt(this.value) || 0 : this.value; state.patchLog.push('edit DynamicLabels[' + i + '].' + prop); }); }
                    table.append($('<tr>').append($('<td>').text(i), $('<td>').append(inp('ValueName')), $('<td>').append(inp('Placeholder')), $('<td>').append(inp('FontHandler', '70px')), $('<td>').append(inp('Width1', '70px')), $('<td>').append(inp('BlendColor', '100px')), $('<td>').append(inp('StringLengthLimit', '70px'))));
                }
                container.append($('<h3>').text('DynamicLabels'), table);
            }
            function renderColors(container) {
                container.empty();
                let table = $('<table>').css({ width: '100%' });
                table.append($('<tr>').append('<th>ID</th><th>Preview</th><th>R</th><th>G</th><th>B</th><th>A</th>'));
                for (let i = 0; i < flpdata.BlendColors.length; i++) {
                    let c = flpdata.BlendColors[i];
                    let prev = $('<div>').css({ width: '36px', height: '18px', border: '1px solid #888', background: 'rgba(' + c.Color[0] / 256 * 255 + ',' + c.Color[1] / 256 * 255 + ',' + c.Color[2] / 256 * 255 + ',' + c.Color[3] / 256 + ')' });
                    let row = $('<tr>').append($('<td>').text(i), $('<td>').append(prev));
                    for (let k = 0; k < 4; k++) { row.append($('<td>').append($('<input type="number" min="0" max="256">').css({ width: '60px' }).val(c.Color[k]).on('change', function() { c.Color[k] = clamp(Number.parseInt(this.value) || 0, 0, 256); state.patchLog.push('edit BlendColors[' + i + ']'); renderColors(container); drawStage(); }))); }
                    table.append(row);
                }
                container.append($('<h3>').text('BlendColors'), table);
            }
            function validateFlp() {
                let problems = [];
                function checkHandler(h, where) {
                    if (!h) { problems.push(where + ': handler vazio'); return; }
                    if (h.TypeArrayId == 8) { return; }
                    let arr = get_obj_arr_by_id(h.TypeArrayId);
                    if (!arr) { problems.push(where + ': TypeArrayId desconhecido ' + h.TypeArrayId); return; }
                    if (h.IdInThatTypeArray < 0 || h.IdInThatTypeArray >= arr.length) { problems.push(where + ': IdInThatTypeArray fora do limite ' + h.IdInThatTypeArray); }
                }
                function scanNode(prefix, node) {
                    if (!node || !node.ElementsAnimation) { return; }
                    for (let i = 0; i < node.ElementsAnimation.length; i++) { let anim = node.ElementsAnimation[i]; for (let j = 0; j < anim.KeyFrames.length; j++) { let k = anim.KeyFrames[j]; checkHandler(k.ElementHandler, prefix + '.ElementsAnimation[' + i + '].KeyFrames[' + j + ']'); if (k.TransformationId >= flpdata.Transformations.length) { problems.push(prefix + ' keyframe transform fora do limite: ' + k.TransformationId); } if (k.ColorId >= flpdata.BlendColors.length) { problems.push(prefix + ' keyframe color fora do limite: ' + k.ColorId); } } }
                }
                for (let i = 0; i < flpdata.GlobalHandlersIndexes.length; i++) { checkHandler(flpdata.GlobalHandlersIndexes[i], 'GlobalHandlersIndexes[' + i + ']'); }
                for (let i = 0; i < flpdata.Datas6.length; i++) { scanNode('Datas6[' + i + '].Sub1', flpdata.Datas6[i].Sub1); }
                for (let i = 0; i < flpdata.Datas7.length; i++) { scanNode('Datas7[' + i + ']', flpdata.Datas7[i]); }
                scanNode('Data8', flpdata.Data8);
                for (let s of collectScripts()) { let lines = s.script.Decompiled || []; if (!lines.length || !String(lines[lines.length - 1]).toLowerCase().includes('end')) { problems.push('Script talvez sem end: ' + s.label); } }
                return problems;
            }
            function downloadEditedJson() {
                let blob = new Blob([JSON.stringify(flpdata, null, 2)], { type: 'application/json' });
                let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'FLP_edited.json'; a.click(); setTimeout(function() { URL.revokeObjectURL(a.href); }, 500);
            }
            function uploadEditedJson() {
                if (!confirm('Enviar JSON editado para fromjson e repackar o FLP no WAD? Faça backup antes.')) { return; }
                let fd = new FormData();
                fd.append('data', new Blob([JSON.stringify(flpdata, null, 2)], { type: 'application/json' }), 'FLP_edited.json');
                $.ajax({ url: getActionLinkForWadNode(wad, tagid, 'fromjson'), method: 'POST', data: fd, processData: false, contentType: false, success: function(a) { if (a != '' && a.error) { alert('Erro no fromjson: ' + a.error); } else { alert('FLP atualizado com sucesso. Reabra o node para recarregar.'); } }, error: function(xhr) { alert('Falha HTTP: ' + xhr.status + ' ' + xhr.responseText); } });
            }

            let root = $('<div id="flp-hud-editor">').css({ display: 'grid', gridTemplateColumns: 'minmax(600px, 1fr) 430px', gap: '8px', padding: '6px' });
            let left = $('<div>'); let right = $('<div>').css({ maxHeight: '76vh', overflow: 'auto' }); let toolbar = $('<div>').css({ marginBottom: '6px' });
            let timelineSel = $('<select>');
            for (let o of timelineOptions()) { timelineSel.append($('<option>').val(o.id).text(o.label)); }
            let frameSlider = $('<input type="range" min="0" value="0">').css({ width: '220px' }).on('input', function() { state.frame = Number.parseInt(this.value) || 0; $('#flp-hud-frame-label').text(state.frame); drawStage(); });
            function updateFrameMax() { let tl = currentTimeline(); let max = tl.node && tl.node.TotalFramesCount ? tl.node.TotalFramesCount - 1 : 0; frameSlider.attr('max', Math.max(0, max)); }
            timelineSel.val(state.timeline).on('change', function() { state.timeline = this.value; state.frame = 0; frameSlider.val(0); updateFrameMax(); drawStage(); });
            let zoomInput = $('<input type="number" step="0.1" min="0.1">').css({ width: '70px' }).val(state.zoom).on('change', function() { state.zoom = Math.max(0.1, n(this.value, 1)); drawStage(); });
            let cloneCheck = $('<input type="checkbox">').prop('checked', state.cloneTransformOnDrag).on('change', function() { state.cloneTransformOnDrag = this.checked; });
            let invertCheck = $('<input type="checkbox">').prop('checked', state.invertY).on('change', function() { state.invertY = this.checked; drawStage(); });
            toolbar.append('Timeline ', timelineSel, ' Frame ', frameSlider, ' <span id="flp-hud-frame-label">0</span> ', ' Zoom ', zoomInput, $('<label>').append(cloneCheck, ' clone transform ao arrastar'), $('<label>').css({ marginLeft: '8px' }).append(invertCheck, ' inverter Y'));
            let canvas = $('<canvas id="flp-hud-stage" width="960" height="540">').css({ width: '100%', border: '1px solid #111', background: '#3c3f41', cursor: 'crosshair' });
            canvas.on('mousedown', function(ev) { let it = hitTest(this, ev); if (!it) { return; } state.selectedKey = it.id; state.selectedItem = it; ensureEditableTransformForSelected(); let p = canvasToWorld(this, ev.clientX, ev.clientY); let tr = flpdata.Transformations[state.selectedItem.keyFrame.TransformationId]; state.drag = { start: p, origX: tr.OffsetX, origY: tr.OffsetY }; drawStage(); });
            canvas.on('mousemove', function(ev) { if (!state.drag || !state.selectedItem) { return; } let p = canvasToWorld(this, ev.clientX, ev.clientY); let tr = flpdata.Transformations[state.selectedItem.keyFrame.TransformationId]; tr.OffsetX = state.drag.origX + (p.x - state.drag.start.x); tr.OffsetY = state.drag.origY + (p.y - state.drag.start.y); drawStage(); });
            $(document).on('mouseup.flphud', function() { if (state.drag && state.selectedItem) { state.patchLog.push('drag ' + state.selectedItem.id); } state.drag = null; });
            let tabs = $('<div>').css({ marginTop: '6px' }); let content = $('<div>').css({ border: '1px solid #333', padding: '6px', minHeight: '160px' });
            function tabButton(name, fn) { return $('<button>').text(name).click(function() { content.empty(); fn(content); }); }
            tabs.append(tabButton('Scripts', renderScriptEditor), tabButton('DynamicLabels', renderDynamicLabels), tabButton('BlendColors', renderColors), $('<button>').text('Validate').click(function() { let p = validateFlp(); content.empty().append($('<h3>').text('Validation'), $('<pre>').text(p.length ? p.join('\n') : 'OK - nenhum problema básico encontrado.')); }), $('<button>').text('Download edited FLP JSON').click(downloadEditedJson), $('<button>').text('Upload edited FLP JSON to WAD').click(uploadEditedJson), $('<button>').text('Render timeline no viewer 3D').click(function() { object_renderer_handler = currentTimeline().handler; flp_view_object_renderer(); }));
            left.append(toolbar, canvas, $('<h3>').text('Elementos visíveis'), $('<div id="flp-hud-elements">').css({ maxHeight: '180px', overflow: 'auto', border: '1px solid #222' }), tabs, content);
            right.append($('<h3>').text('Inspector'), $('<div id="flp-hud-inspector">'));
            root.append(left, right); dataSummary.append(root); updateFrameMax(); drawStage();
        }
    dataSummarySelectors.append($('<div class="item-selector">').click(flp_hud_stage_editor).text("HUD editor"));
    dataSummarySelectors.append($('<div class="item-selector">').click(flp_list_labels).text("Labels editor"));
    dataSummarySelectors.append($('<div class="item-selector">').click(flp_print_dump).text("Dump"));
    dataSummarySelectors.append($('<div class="item-selector">').click(flp_view_font).text("Font viewer"));
    dataSummarySelectors.append($('<div class="item-selector">').click(flp_view_object_viewer).text("Obj explorer"));
    dataSummarySelectors.append($('<div class="item-selector">').click(flp_view_object_renderer).text("Obj renderer"));

    // flp_list_labels();
    flp_view_object_viewer();
    flp_view_object_renderer();
}