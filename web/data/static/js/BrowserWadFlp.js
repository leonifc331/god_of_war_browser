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
            texture = new grTexture('data:image/png;base64,' + img);
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

    let model = new grModel();

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
            let material = new grMaterial();
            let layer = new grMaterialLayer();
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

    model.matrix = transform.toMatrix3d();

    // console.log("MODELS FROM DATA2", [model]);
    return [model];
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
                    console.log(obj.Materials, obj, flp);
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

        let mdl = new grModel();
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

                            let material = new grMaterial();

                            let texture = new grTexture('data:image/png;base64,' + img);
                            texture.markAsFontTexture();

                            let layer = new grMaterialLayer();
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
                let cubemesh = grHelper_CubeLines(symbolWidth / 32, 0, 0, symbolWidth / 32, 500, 5, false);
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
        gr_instance.models.push(mdl);
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
            gr_instance.models = gr_instance.models.concat(elementsRenderModels);
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
        dataSummary.empty();

        const TYPE_NAMES = objNamesArray;
        const state = {
            timelineId: 'root',
            frame: 0,
            zoom: 1.0,
            invertY: true,
            cloneTransformOnDrag: true,
            selectedKey: null,
            selectedEntry: null,
            filter: '',
            tab: 'stage',
            stageW: 960,
            stageH: 540
        };

        const deepClone = function(v) {
            return JSON.parse(JSON.stringify(v));
        };

        const asArray = function(v) {
            return Array.isArray(v) ? v : [];
        };

        const safeNum = function(v, fallback) {
            let n = Number.parseFloat(v);
            return Number.isFinite(n) ? n : fallback;
        };

        const safeInt = function(v, fallback) {
            let n = Number.parseInt(v);
            return Number.isFinite(n) ? n : fallback;
        };

        const handlerToString = function(h) {
            if (!h) {
                return 'null handler';
            }
            let name = TYPE_NAMES[h.TypeArrayId] || ('Type' + h.TypeArrayId);
            return name + '[' + h.IdInThatTypeArray + ']';
        };

        const getHandlerObject = function(h) {
            return h ? get_obj_by_handler(h) : undefined;
        };

        const getTimelineOptions = function() {
            let result = [];
            if (flpdata.Data8 && flpdata.Data8.ElementsAnimation) {
                result.push({ id: 'root', label: 'ROOT / Data8', handler: { TypeArrayId: 8, IdInThatTypeArray: 0 }, node: flpdata.Data8 });
            }
            for (let i = 0; i < asArray(flpdata.Datas7).length; i++) {
                let n = flpdata.Datas7[i];
                if (n && n.ElementsAnimation) {
                    result.push({ id: 'd7:' + i, label: 'Datas7[' + i + '] frames=' + (n.TotalFramesCount || 1), handler: { TypeArrayId: 7, IdInThatTypeArray: i }, node: n });
                }
            }
            for (let i = 0; i < asArray(flpdata.Datas6).length; i++) {
                let n = flpdata.Datas6[i] && flpdata.Datas6[i].Sub1;
                if (n && n.ElementsAnimation) {
                    result.push({ id: 'd6:' + i, label: 'Datas6[' + i + '].Sub1 frames=' + (n.TotalFramesCount || 1), handler: { TypeArrayId: 6, IdInThatTypeArray: i }, node: n });
                }
            }
            return result;
        };

        let timelines = getTimelineOptions();
        if (timelines.length === 0) {
            dataSummary.append($('<div class="flp-hud-panel">').text('Nenhuma timeline FLP com ElementsAnimation foi encontrada.'));
            return;
        }

        const getTimeline = function() {
            return timelines.find(function(t) { return t.id === state.timelineId; }) || timelines[0];
        };

        const getFrameMax = function() {
            let tl = getTimeline().node;
            return Math.max(0, (tl.TotalFramesCount || 1) - 1);
        };

        const getCurrentKeyFrame = function(element, frameIndex) {
            let frames = asArray(element.KeyFrames);
            if (frames.length === 0) {
                return { frame: undefined, index: -1 };
            }
            for (let i = 0; i < frames.length; i++) {
                if (frameIndex <= frames[i].WhenThisFrameEnds) {
                    return { frame: frames[i], index: i };
                }
            }
            return { frame: frames[frames.length - 1], index: frames.length - 1 };
        };

        const getTransformUsage = function() {
            let usage = {};
            const countTimeline = function(timeline) {
                for (let i = 0; i < asArray(timeline.ElementsAnimation).length; i++) {
                    let el = timeline.ElementsAnimation[i];
                    for (let j = 0; j < asArray(el.KeyFrames).length; j++) {
                        let id = el.KeyFrames[j].TransformationId;
                        usage[id] = (usage[id] || 0) + 1;
                    }
                }
            };
            if (flpdata.Data8) countTimeline(flpdata.Data8);
            for (let i = 0; i < asArray(flpdata.Datas7).length; i++) countTimeline(flpdata.Datas7[i]);
            for (let i = 0; i < asArray(flpdata.Datas6).length; i++) if (flpdata.Datas6[i] && flpdata.Datas6[i].Sub1) countTimeline(flpdata.Datas6[i].Sub1);
            return usage;
        };

        const ensureEditableTransform = function(entry) {
            if (!entry || !entry.frame) {
                return undefined;
            }
            let tid = entry.frame.TransformationId;
            let t = flpdata.Transformations[tid];
            if (!t) {
                t = { Matrix: [1, 0, 0, 1], OffsetX: 0, OffsetY: 0 };
                flpdata.Transformations.push(t);
                entry.frame.TransformationId = flpdata.Transformations.length - 1;
                return t;
            }
            if (state.cloneTransformOnDrag) {
                let usage = getTransformUsage();
                if ((usage[tid] || 0) > 1) {
                    let nt = deepClone(t);
                    flpdata.Transformations.push(nt);
                    entry.frame.TransformationId = flpdata.Transformations.length - 1;
                    t = nt;
                    appendLog('Transform ' + tid + ' clonado para ' + entry.frame.TransformationId + ' antes da edição.');
                }
            }
            return t;
        };

        const forceCloneSelectedTransform = function() {
            if (!state.selectedEntry || !state.selectedEntry.frame) {
                return;
            }
            let tid = state.selectedEntry.frame.TransformationId;
            let t = flpdata.Transformations[tid] || { Matrix: [1, 0, 0, 1], OffsetX: 0, OffsetY: 0 };
            flpdata.Transformations.push(deepClone(t));
            state.selectedEntry.frame.TransformationId = flpdata.Transformations.length - 1;
            appendLog('Transform ' + tid + ' clonado manualmente para ' + state.selectedEntry.frame.TransformationId + '.');
            drawAll();
        };

        const colorToCss = function(colorId, alpha) {
            let c = flpdata.BlendColors && flpdata.BlendColors[colorId] ? flpdata.BlendColors[colorId].Color : [256, 256, 256, 256];
            let r = Math.max(0, Math.min(255, Math.round((c[0] / 256.0) * 255)));
            let g = Math.max(0, Math.min(255, Math.round((c[1] / 256.0) * 255)));
            let b = Math.max(0, Math.min(255, Math.round((c[2] / 256.0) * 255)));
            let a = alpha === undefined ? Math.max(0.25, Math.min(1, c[3] / 256.0)) : alpha;
            return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
        };

        const getElementLabel = function(entry) {
            let h = entry.frame && entry.frame.ElementHandler;
            if (!h) return 'empty';
            let obj = getHandlerObject(h);
            let prefix = handlerToString(h);
            if (entry.frame.Name) {
                prefix += ' .' + entry.frame.Name;
            }
            if (h.TypeArrayId === 1 && obj) {
                return prefix + ' mesh=' + obj.MeshPartIndex;
            }
            if (h.TypeArrayId === 5 && obj) {
                let pieces = [];
                if (obj.Placeholder !== undefined) pieces.push('ph=' + obj.Placeholder);
                if (obj.Text !== undefined) pieces.push('text=' + obj.Text);
                if (obj.Width !== undefined) pieces.push('w=' + obj.Width);
                return prefix + (pieces.length ? ' ' + pieces.join(' ') : '');
            }
            if ((h.TypeArrayId === 7 || h.TypeArrayId === 8 || h.TypeArrayId === 6) && obj) {
                let total = obj.TotalFramesCount || (obj.Sub1 && obj.Sub1.TotalFramesCount) || 1;
                return prefix + ' frames=' + total;
            }
            return prefix;
        };

        const getVisibleEntries = function() {
            let tl = getTimeline().node;
            let entries = [];
            let filter = state.filter.toLowerCase();
            for (let i = 0; i < asArray(tl.ElementsAnimation).length; i++) {
                let element = tl.ElementsAnimation[i];
                let kf = getCurrentKeyFrame(element, state.frame);
                if (!kf.frame) continue;
                let h = kf.frame.ElementHandler;
                if (!h || h.TypeArrayId === 0) continue;
                let label = getElementLabel({ frame: kf.frame, element: element });
                if (filter && label.toLowerCase().indexOf(filter) < 0) continue;
                entries.push({ key: i + ':' + kf.index, elementIndex: i, keyFrameIndex: kf.index, element: element, frame: kf.frame, label: label });
            }
            return entries;
        };

        const collectScripts = function() {
            let scripts = [];
            const add = function(path, script) {
                if (script && script.Decompiled) scripts.push({ path: path, script: script });
            };
            const scanFrameLabels = function(prefix, timeline) {
                for (let i = 0; i < asArray(timeline.FrameScriptLables).length; i++) {
                    let lab = timeline.FrameScriptLables[i];
                    for (let j = 0; j < asArray(lab.Subs).length; j++) {
                        add(prefix + '.FrameScriptLables[' + i + '].Subs[' + j + '] frame=' + lab.TriggerFrameNumber + ' label=' + lab.LabelName, lab.Subs[j].Script);
                    }
                }
            };
            if (flpdata.Data8) scanFrameLabels('Data8', flpdata.Data8);
            for (let i = 0; i < asArray(flpdata.Datas7).length; i++) scanFrameLabels('Datas7[' + i + ']', flpdata.Datas7[i]);
            for (let i = 0; i < asArray(flpdata.Datas6).length; i++) {
                let d6 = flpdata.Datas6[i];
                if (!d6) continue;
                if (d6.Sub1) scanFrameLabels('Datas6[' + i + '].Sub1', d6.Sub1);
                for (let j = 0; j < asArray(d6.Sub2s).length; j++) {
                    add('Datas6[' + i + '].Sub2s[' + j + '] mask=' + d6.Sub2s[j].EventKeysMask, d6.Sub2s[j].Script);
                }
            }
            return scripts;
        };

        const validateFlp = function() {
            let issues = [];
            const validateTimeline = function(prefix, timeline) {
                for (let i = 0; i < asArray(timeline.ElementsAnimation).length; i++) {
                    let el = timeline.ElementsAnimation[i];
                    for (let j = 0; j < asArray(el.KeyFrames).length; j++) {
                        let k = el.KeyFrames[j];
                        if (!k.ElementHandler) issues.push(prefix + '.ElementsAnimation[' + i + '].KeyFrames[' + j + '] sem ElementHandler');
                        if (k.ElementHandler) {
                            let arr = get_obj_arr_by_id(k.ElementHandler.TypeArrayId);
                            if (k.ElementHandler.TypeArrayId !== 0 && k.ElementHandler.TypeArrayId !== 8 && (!arr || !arr[k.ElementHandler.IdInThatTypeArray])) {
                                issues.push(prefix + '.ElementsAnimation[' + i + '].KeyFrames[' + j + '] handler inválido ' + handlerToString(k.ElementHandler));
                            }
                        }
                        if (!flpdata.Transformations || !flpdata.Transformations[k.TransformationId]) issues.push(prefix + '.ElementsAnimation[' + i + '].KeyFrames[' + j + '] TransformationId inválido ' + k.TransformationId);
                        if (!flpdata.BlendColors || !flpdata.BlendColors[k.ColorId]) issues.push(prefix + '.ElementsAnimation[' + i + '].KeyFrames[' + j + '] ColorId inválido ' + k.ColorId);
                    }
                }
            };
            if (flpdata.Data8) validateTimeline('Data8', flpdata.Data8);
            for (let i = 0; i < asArray(flpdata.Datas7).length; i++) validateTimeline('Datas7[' + i + ']', flpdata.Datas7[i]);
            for (let i = 0; i < asArray(flpdata.Datas6).length; i++) if (flpdata.Datas6[i] && flpdata.Datas6[i].Sub1) validateTimeline('Datas6[' + i + '].Sub1', flpdata.Datas6[i].Sub1);

            let scripts = collectScripts();
            for (let i = 0; i < scripts.length; i++) {
                let code = asArray(scripts[i].script.Decompiled);
                if (code.length === 0 || !String(code[code.length - 1]).trim().startsWith('00:')) {
                    issues.push('Script sem end: ' + scripts[i].path);
                }
            }

            for (let i = 0; i < asArray(flpdata.GlobalHandlersIndexes).length; i++) {
                let h = flpdata.GlobalHandlersIndexes[i];
                if (!h) continue;
                let arr = get_obj_arr_by_id(h.TypeArrayId);
                if (h.TypeArrayId !== 0 && h.TypeArrayId !== 8 && (!arr || h.IdInThatTypeArray < 0 || h.IdInThatTypeArray >= arr.length)) {
                    issues.push('GlobalHandlersIndexes[' + i + '] aponta para ' + handlerToString(h) + ' fora do limite');
                }
            }
            return issues;
        };

        const downloadJson = function(name, obj) {
            let blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
            let a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            a.click();
            setTimeout(function() { URL.revokeObjectURL(a.href); }, 500);
        };

        const uploadEditedJson = function() {
            if (!confirm('Enviar JSON editado para fromjson e repackar este FLP no WAD? Faça backup antes.')) return;
            let fd = new FormData();
            fd.append('data', new Blob([JSON.stringify(flp, null, 2)], { type: 'application/json' }), 'FLP_edited.json');
            $.ajax({
                url: getActionLinkForWadNode(wad, tagid, 'fromjson'),
                method: 'POST',
                data: fd,
                processData: false,
                contentType: false,
                success: function(a) {
                    if (a !== '' && a && a.error) alert('Erro: ' + a.error);
                    else if (a !== '') alert('Resposta do servidor: ' + a);
                    else alert('FLP enviado com sucesso. Recarregue o WAD para conferir.');
                },
                error: function(xhr) {
                    alert('Falha no upload: ' + xhr.status + ' ' + xhr.statusText);
                }
            });
        };

        const appendLog = function(msg) {
            let now = new Date().toLocaleTimeString();
            $log.prepend($('<div>').text('[' + now + '] ' + msg));
        };

        const openSelectedInExplorer = function() {
            if (!state.selectedEntry || !state.selectedEntry.frame) return;
            flp_obj_view_history.unshift(state.selectedEntry.frame.ElementHandler);
            flp_view_object_viewer();
        };

        const renderSelectedIn3d = function() {
            let tl = getTimeline();
            object_renderer_handler = tl.handler;
            object_renderer_frame = state.frame;
            flp_view_object_renderer();
        };

        const $root = $('<div id="flp-hud-editor">');
        const $toolbar = $('<div class="flp-hud-toolbar">');
        const $tabs = $('<div class="flp-hud-tabs">');
        const $body = $('<div class="flp-hud-body">');
        const $log = $('<div class="flp-hud-log">');

        const $timeline = $('<select class="flp-hud-select">');
        timelines.forEach(function(t) { $timeline.append($('<option>').val(t.id).text(t.label)); });
        $timeline.val(state.timelineId).on('change', function() {
            state.timelineId = this.value;
            state.frame = 0;
            state.selectedKey = null;
            drawAll();
        });

        const $frame = $('<input type="range" min="0" value="0" class="flp-hud-range">');
        const $frameText = $('<span class="flp-hud-pill">Frame 0</span>');
        $frame.on('input', function() {
            state.frame = safeInt(this.value, 0);
            state.selectedKey = null;
            drawAll();
        });

        const $zoom = $('<input type="number" step="0.1" min="0.1" max="20" class="flp-hud-small-input">').val(state.zoom).on('change', function() {
            state.zoom = Math.max(0.1, safeNum(this.value, 1));
            drawAll();
        });
        const $filter = $('<input type="search" placeholder="filtrar elemento, mesh, label..." class="flp-hud-filter">').on('input', function() {
            state.filter = this.value;
            drawAll();
        });
        const $clone = $('<input type="checkbox">').prop('checked', state.cloneTransformOnDrag).on('change', function() { state.cloneTransformOnDrag = this.checked; });
        const $invert = $('<input type="checkbox">').prop('checked', state.invertY).on('change', function() { state.invertY = this.checked; drawAll(); });

        $toolbar.append($('<label>').text('Timeline ').append($timeline));
        $toolbar.append($('<label>').text('Frame ').append($frame));
        $toolbar.append($frameText);
        $toolbar.append($('<label>').text('Zoom ').append($zoom));
        $toolbar.append($('<label class="flp-hud-check">').append($clone).append(' clonar transform ao mover'));
        $toolbar.append($('<label class="flp-hud-check">').append($invert).append(' inverter Y'));
        $toolbar.append($filter);
        $toolbar.append($('<button>').text('Render timeline no 3D').click(renderSelectedIn3d));
        $toolbar.append($('<button>').text('Validar').click(function() { state.tab = 'validate'; drawAll(); }));
        $toolbar.append($('<button>').text('Baixar JSON completo').click(function() { downloadJson('FLP_edited_full.json', flp); }));
        $toolbar.append($('<button>').text('Baixar FLP-only').click(function() { downloadJson('FLP_edited_only.json', flpdata); }));
        $toolbar.append($('<button>').text('Enviar para fromjson').click(uploadEditedJson));

        const makeTab = function(id, text) {
            return $('<button class="flp-hud-tab">').attr('data-tab', id).text(text).click(function() { state.tab = id; drawAll(); });
        };
        $tabs.append(makeTab('stage', 'Stage/posição'));
        $tabs.append(makeTab('labels', 'DynamicLabels'));
        $tabs.append(makeTab('colors', 'BlendColors'));
        $tabs.append(makeTab('scripts', 'Scripts'));
        $tabs.append(makeTab('validate', 'Validação'));
        $tabs.append(makeTab('raw', 'Raw JSON'));

        $root.append($toolbar, $tabs, $body, $('<h3>').text('Patch log'), $log);
        dataSummary.append($root);

        const drawAll = function() {
            let max = getFrameMax();
            state.frame = Math.max(0, Math.min(state.frame, max));
            $frame.attr('max', max).val(state.frame);
            $frameText.text('Frame ' + state.frame + ' / ' + max);
            $tabs.find('button').removeClass('active').each(function() { if ($(this).attr('data-tab') === state.tab) $(this).addClass('active'); });
            $body.empty();
            if (state.tab === 'stage') drawStage();
            else if (state.tab === 'labels') drawLabels();
            else if (state.tab === 'colors') drawColors();
            else if (state.tab === 'scripts') drawScripts();
            else if (state.tab === 'validate') drawValidation();
            else drawRaw();
        };

        const drawStage = function() {
            let entries = getVisibleEntries();
            let $layout = $('<div class="flp-hud-stage-layout">');
            let $left = $('<div class="flp-hud-stage-wrap">');
            let $stage = $('<div class="flp-hud-stage">').css({ width: state.stageW + 'px', height: state.stageH + 'px' });
            let $inspector = $('<div class="flp-hud-inspector">');
            let $list = $('<div class="flp-hud-element-list">');

            $stage.append($('<div class="flp-hud-axis-x">'), $('<div class="flp-hud-axis-y">'), $('<div class="flp-hud-origin">'));
            $left.append($('<div class="flp-hud-stage-title">').text(getTimeline().label + ' - elementos visíveis: ' + entries.length), $stage);
            $layout.append($left, $inspector, $list);
            $body.append($layout);

            entries.forEach(function(entry) {
                let t = flpdata.Transformations[entry.frame.TransformationId] || { Matrix: [1, 0, 0, 1], OffsetX: 0, OffsetY: 0 };
                let x = state.stageW / 2 + (t.OffsetX || 0) * state.zoom;
                let y = state.stageH / 2 + (state.invertY ? -(t.OffsetY || 0) : (t.OffsetY || 0)) * state.zoom;
                let selected = entry.key === state.selectedKey;
                let $item = $('<div class="flp-hud-item">').toggleClass('selected', selected).text(entry.label);
                $item.css({ left: x + 'px', top: y + 'px', borderColor: colorToCss(entry.frame.ColorId, 1), backgroundColor: colorToCss(entry.frame.ColorId, 0.25) });
                $item.attr('title', entry.label + '\nTransform=' + entry.frame.TransformationId + ' Color=' + entry.frame.ColorId);
                $item.on('mousedown', function(ev) {
                    ev.preventDefault();
                    state.selectedKey = entry.key;
                    state.selectedEntry = entry;
                    let transform = ensureEditableTransform(entry);
                    let startX = ev.pageX;
                    let startY = ev.pageY;
                    let ox = transform.OffsetX || 0;
                    let oy = transform.OffsetY || 0;
                    $(document).on('mousemove.flphud', function(moveEv) {
                        let dx = (moveEv.pageX - startX) / state.zoom;
                        let dy = (moveEv.pageY - startY) / state.zoom;
                        transform.OffsetX = ox + dx;
                        transform.OffsetY = oy + (state.invertY ? -dy : dy);
                        drawAll();
                    });
                    $(document).on('mouseup.flphud', function() {
                        $(document).off('.flphud');
                        appendLog('Movido ' + entry.label + ' para X=' + transform.OffsetX.toFixed(3) + ' Y=' + transform.OffsetY.toFixed(3));
                    });
                });
                $stage.append($item);

                let $row = $('<div class="flp-hud-element-row">').toggleClass('selected', selected);
                $row.append($('<b>').text('#' + entry.elementIndex + ' '), $('<span>').text(entry.label));
                $row.click(function() { state.selectedKey = entry.key; state.selectedEntry = entry; drawAll(); });
                $list.append($row);
            });

            if (!state.selectedEntry && entries.length) {
                state.selectedEntry = entries[0];
                state.selectedKey = entries[0].key;
                drawAll();
                return;
            }
            drawInspector($inspector);
        };

        const drawInspector = function($inspector) {
            $inspector.empty();
            let e = state.selectedEntry;
            if (!e || !e.frame) {
                $inspector.append($('<h3>').text('Inspector'), $('<p>').text('Selecione um item no stage ou na lista.'));
                return;
            }
            let k = e.frame;
            let t = flpdata.Transformations[k.TransformationId] || { Matrix: [1, 0, 0, 1], OffsetX: 0, OffsetY: 0 };
            let obj = getHandlerObject(k.ElementHandler);
            let $title = $('<h3>').text('Inspector');
            let $meta = $('<div class="flp-hud-meta">').append(
                $('<div>').text('Elemento: ' + e.elementIndex + ' / KeyFrame: ' + e.keyFrameIndex),
                $('<div>').text('Handler: ' + handlerToString(k.ElementHandler)),
                $('<div>').text('Objeto existe: ' + (obj ? 'sim' : 'não'))
            );
            $inspector.append($title, $meta);

            const addNumber = function(label, value, cb, step) {
                let $i = $('<input type="number" class="flp-hud-num">').attr('step', step || '0.0625').val(value).on('change', function() { cb(safeNum(this.value, value)); drawAll(); });
                $inspector.append($('<label class="flp-hud-field">').append($('<span>').text(label), $i));
            };
            const addText = function(label, value, cb) {
                let $i = $('<input type="text" class="flp-hud-text">').val(value || '').on('change', function() { cb(this.value); drawAll(); });
                $inspector.append($('<label class="flp-hud-field">').append($('<span>').text(label), $i));
            };
            addText('Nome do keyframe', k.Name || '', function(v) { k.Name = v; appendLog('Nome alterado para ' + v); });
            addNumber('WhenThisFrameEnds', k.WhenThisFrameEnds, function(v) { k.WhenThisFrameEnds = v; }, '1');
            addNumber('TransformationId', k.TransformationId, function(v) { k.TransformationId = Math.max(0, safeInt(v, 0)); }, '1');
            addNumber('ColorId', k.ColorId, function(v) { k.ColorId = Math.max(0, safeInt(v, 0)); }, '1');
            addNumber('OffsetX', t.OffsetX || 0, function(v) { t.OffsetX = v; });
            addNumber('OffsetY', t.OffsetY || 0, function(v) { t.OffsetY = v; });
            for (let i = 0; i < 4; i++) {
                addNumber('Matrix[' + i + ']', asArray(t.Matrix)[i] || (i === 0 || i === 3 ? 1 : 0), function(v) { if (!t.Matrix) t.Matrix = [1, 0, 0, 1]; t.Matrix[i] = v; }, '0.0001');
            }
            $inspector.append($('<div class="flp-hud-actions">')
                .append($('<button>').text('Clonar transform').click(forceCloneSelectedTransform))
                .append($('<button>').text('Abrir no Obj explorer').click(openSelectedInExplorer))
                .append($('<button>').text('Render timeline no 3D').click(renderSelectedIn3d))
            );
            $inspector.append($('<details>').append($('<summary>').text('Objeto raw'), $('<pre>').text(JSON.stringify(obj, null, 2))));
        };

        const drawLabels = function() {
            let labels = asArray(flpdata.DynamicLabels);
            let $wrap = $('<div class="flp-hud-table-wrap">');
            let $table = $('<table class="flp-hud-table">');
            $table.append($('<tr>').append($('<th>').text('Id'), $('<th>').text('Resumo'), $('<th>').text('JSON editável')));
            for (let i = 0; i < labels.length; i++) {
                let label = labels[i];
                let summary = [];
                Object.keys(label || {}).slice(0, 8).forEach(function(k) { if (typeof label[k] !== 'object') summary.push(k + '=' + label[k]); });
                let $ta = $('<textarea class="flp-hud-json-cell">').val(JSON.stringify(label, null, 2));
                let $apply = $('<button>').text('Aplicar').click(function() {
                    try { flpdata.DynamicLabels[i] = JSON.parse($ta.val()); appendLog('DynamicLabels[' + i + '] atualizado.'); drawLabels(); }
                    catch (e) { alert('JSON inválido em DynamicLabels[' + i + ']: ' + e.message); }
                });
                $table.append($('<tr>').append($('<td>').text(i), $('<td>').text(summary.join(' | ')), $('<td>').append($ta, $('<br>'), $apply)));
            }
            $wrap.append($table);
            $body.append($wrap);
        };

        const drawColors = function() {
            let colors = asArray(flpdata.BlendColors);
            let $table = $('<table class="flp-hud-table">');
            $table.append($('<tr>').append($('<th>').text('Id'), $('<th>').text('Preview'), $('<th>').text('R'), $('<th>').text('G'), $('<th>').text('B'), $('<th>').text('A')));
            for (let i = 0; i < colors.length; i++) {
                let c = colors[i].Color || [256, 256, 256, 256];
                let $row = $('<tr>');
                $row.append($('<td>').text(i), $('<td>').append($('<div class="flp-hud-color-preview">').css('background-color', colorToCss(i))));
                for (let ch = 0; ch < 4; ch++) {
                    let $input = $('<input type="number" min="0" max="256" step="1" class="flp-hud-color-input">').val(c[ch]).on('change', function() {
                        c[ch] = Math.max(0, Math.min(256, safeInt(this.value, c[ch])));
                        appendLog('BlendColors[' + i + '] = [' + c.join(', ') + ']');
                        drawColors();
                    });
                    $row.append($('<td>').append($input));
                }
                $table.append($row);
            }
            $body.append($('<div class="flp-hud-table-wrap">').append($table));
        };

        const drawScripts = function() {
            let scripts = collectScripts();
            let $select = $('<select class="flp-hud-select flp-hud-script-select">');
            for (let i = 0; i < scripts.length; i++) $select.append($('<option>').val(i).text(i + ': ' + scripts[i].path));
            let $ta = $('<textarea class="flp-hud-script-text">');
            let load = function() {
                let item = scripts[safeInt($select.val(), 0)];
                $ta.val(asArray(item.script.Decompiled).join('\n'));
            };
            $select.on('change', load);
            let $buttons = $('<div class="flp-hud-actions">');
            [
                '00:                  // end',
                '07:                  // Stop (current target)',
                '06:                  // Play (current target)',
                '8B: ""               // SetTarget \'\'',
                '8C: "Label"          // GotoLabel \'Label\'',
                '9E:                  // CallFrame @pop_string',
                '96: "text"           // push_string \'text\''
            ].forEach(function(line) {
                $buttons.append($('<button>').text(line.split('//')[1] || line).click(function() { $ta.val($ta.val() + ($ta.val() ? '\n' : '') + line); }));
            });
            let $apply = $('<button>').text('Aplicar script').click(function() {
                let item = scripts[safeInt($select.val(), 0)];
                item.script.Decompiled = $ta.val().split(/\r?\n/);
                appendLog('Script atualizado: ' + item.path);
            });
            let $find = $('<input class="flp-hud-filter" placeholder="procurar nos scripts">');
            let $replace = $('<input class="flp-hud-filter" placeholder="substituir por">');
            let $replaceBtn = $('<button>').text('Find/Replace global').click(function() {
                let f = $find.val();
                if (!f) return;
                let r = $replace.val();
                let total = 0;
                scripts.forEach(function(item) {
                    item.script.Decompiled = asArray(item.script.Decompiled).map(function(line) {
                        if (String(line).indexOf(f) >= 0) { total++; return String(line).split(f).join(r); }
                        return line;
                    });
                });
                appendLog('Find/Replace aplicado em ' + total + ' linhas.');
                load();
            });
            $body.append($('<div class="flp-hud-script-editor">').append($('<h3>').text('Scripts Decompiled'), $select, $buttons, $ta, $('<div class="flp-hud-actions">').append($apply, $find, $replace, $replaceBtn)));
            load();
        };

        const drawValidation = function() {
            let issues = validateFlp();
            let $box = $('<div class="flp-hud-validation">');
            if (issues.length === 0) {
                $box.append($('<div class="flp-hud-ok">').text('Nenhum problema crítico detectado.'));
            } else {
                $box.append($('<div class="flp-hud-bad">').text(issues.length + ' problema(s) encontrado(s):'));
                let $ul = $('<ul>');
                issues.forEach(function(i) { $ul.append($('<li>').text(i)); });
                $box.append($ul);
            }
            $body.append($box);
        };

        const drawRaw = function() {
            let $ta = $('<textarea class="flp-hud-raw-json">').val(JSON.stringify(flpdata, null, 2));
            let $apply = $('<button>').text('Aplicar Raw JSON no FLP').click(function() {
                try {
                    let edited = JSON.parse($ta.val());
                    Object.keys(flpdata).forEach(function(k) { delete flpdata[k]; });
                    Object.keys(edited).forEach(function(k) { flpdata[k] = edited[k]; });
                    appendLog('Raw JSON aplicado.');
                    drawAll();
                } catch (e) {
                    alert('JSON inválido: ' + e.message);
                }
            });
            $body.append($('<div class="flp-hud-raw">').append($('<p>').text('Edição avançada. Use validação antes de exportar.'), $ta, $('<br>'), $apply));
        };

        drawAll();
    }

    dataSummarySelectors.append($('<div class="item-selector">').click(flp_list_labels).text("Labels editor"));
    dataSummarySelectors.append($('<div class="item-selector">').click(flp_print_dump).text("Dump"));
    dataSummarySelectors.append($('<div class="item-selector">').click(flp_view_font).text("Font viewer"));
    dataSummarySelectors.append($('<div class="item-selector">').click(flp_view_object_viewer).text("Obj explorer"));
    dataSummarySelectors.append($('<div class="item-selector">').click(flp_view_object_renderer).text("Obj renderer"));
    dataSummarySelectors.append($('<div class="item-selector">').click(flp_hud_stage_editor).text("HUD editor"));

    // flp_list_labels();
    flp_view_object_viewer();
    flp_view_object_renderer();
}

/* ========================================================================== */
/* Pro FLP utility layer                                                        */
/* ========================================================================== */
if (typeof gowFlp !== 'undefined') {
    gowFlp.prototype.resolveHandlerName = function(handler) {
        if (!handler) return '<null handler>';
        var names = {0:'Null',1:'MeshPart',3:'Font',4:'StaticLabel',5:'DynamicLabel',6:'Data6',7:'Timeline',8:'Root',9:'Transform',10:'Color'};
        var base = names[handler.TypeArrayId] || ('Type' + handler.TypeArrayId);
        return base + '[' + handler.IdInThatTypeArray + ']';
    };

    gowFlp.prototype.validateLight = function() {
        var errors = [];
        var data = this.data;
        function chkArr(arr, id, name) {
            if (id < 0 || !arr || id >= arr.length) errors.push(name + ' id fora do limite: ' + id);
        }
        function checkKeyFrame(kf, ctx) {
            if (!kf) return;
            if (kf.ElementHandler) {
                var arr = (kf.ElementHandler.TypeArrayId === 8) ? [data.Data8] : this.getObjArrByType(kf.ElementHandler.TypeArrayId);
                chkArr.call(this, arr, kf.ElementHandler.IdInThatTypeArray, ctx + ' handler ' + kf.ElementHandler.TypeArrayId);
            }
            chkArr(data.Transformations, kf.TransformationId, ctx + ' transform');
            chkArr(data.BlendColors, kf.ColorId, ctx + ' color');
        }
        if (data.Data8 && data.Data8.ElementsAnimation) {
            for (var e = 0; e < data.Data8.ElementsAnimation.length; e++) {
                var el = data.Data8.ElementsAnimation[e];
                for (var k = 0; k < el.KeyFrames.length; k++) checkKeyFrame.call(this, el.KeyFrames[k], 'Data8['+e+'].KeyFrames['+k+']');
            }
        }
        if (data.Datas7) {
            for (var d = 0; d < data.Datas7.length; d++) {
                var tl = data.Datas7[d];
                if (!tl || !tl.ElementsAnimation) continue;
                for (var e2 = 0; e2 < tl.ElementsAnimation.length; e2++) {
                    for (var k2 = 0; k2 < tl.ElementsAnimation[e2].KeyFrames.length; k2++) checkKeyFrame.call(this, tl.ElementsAnimation[e2].KeyFrames[k2], 'Datas7['+d+']['+e2+']['+k2+']');
                }
            }
        }
        return errors;
    };
}
