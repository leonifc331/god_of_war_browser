$(document).ready(function() {
    var data3d = $('.view-item-container');
    gwInitRenderer(data3d);
    gr_instance.setInterfaceCameraMode(true);

    var url = new URL(document.location);
    var packfile = url.searchParams.get('f');
    var flpid = url.searchParams.get('r');
    var commands = JSON.parse(url.searchParams.get('c'));
    var rootMatrix = url.searchParams.get('m');
    if (!rootMatrix) {
        rootMatrix = mat4.create();
    } else {
        rootMatrix = JSON.parse(rootMatrix);
    }

    $.getJSON('/json/pack/' + packfile + '/' + flpid, function(resp) {
        var flp = resp.Data;
        var flpdata = flp.FLP;

        var font = undefined;
        var x = 0;
        var y = 0;
        var fontscale = 1.0;

        var matmap = {};

        for (var iCmd in commands) {
            var cmd = commands[iCmd];

            if (cmd.Flags & 8) {
                font = flpdata.Fonts[flpdata.GlobalHandlersIndexes[cmd.FontHandler].IdInThatTypeArray];
                fontscale = cmd.FontScale;
            }
            if (cmd.Flags & 2) {
                x = cmd.OffsetX;
            }
            if (cmd.Flags & 1) {
                y = cmd.OffsetY;
            }

            for (var iGlyph in cmd.Glyphs) {
                var glyph = cmd.Glyphs[iGlyph];

                var chrdata = font.MeshesRefs[glyph.GlyphId];

                if (chrdata.MeshPartIndex !== -1) {
                    var mdl = new grModel();
                    meshes = loadMeshPartFromAjax(mdl, flp.Model.Meshes[0], chrdata.MeshPartIndex);

                    if (chrdata.Materials && chrdata.Materials.length !== 0 && chrdata.Materials[0].TextureName) {
                        var txr_name = chrdata.Materials[0].TextureName;

                        if (!matmap.hasOwnProperty(txr_name)) {
                            var material = new grMaterial();
                            var img = flp.Textures[txr_name].Images[0].Image

                            var texture = new grTexture('data:image/png;base64,' + img);
                            texture.markAsFontTexture();

                            var layer = new grMaterialLayer();
                            layer.setTextures([texture]);
                            material.addLayer(layer);

                            matmap[txr_name] = material;
                        }
                        mdl.addMaterial(matmap[txr_name]);
                        for (var iMesh in meshes) {
                            meshes[iMesh].setMaterialID(0);
                        }
                    }

                    var matrix = mat4.translate(mat4.create(), rootMatrix, [x, y, 0]);
                    mdl.matrix = mat4.scale(mat4.create(), matrix, [fontscale, fontscale, fontscale]);
                    gr_instance.models.push(mdl);
                }

                x += glyph.Width;
            }

        }
        gr_instance.flushScene();
        gr_instance.requestRedraw();
    });


});

/* ========================================================================== */
/* Pro label preview controls                                                   */
/* ========================================================================== */
$(document).ready(function() {
    setTimeout(function() {
        if (!$('#label-pro-toolbar').length) {
            var $bar = $('<div id="label-pro-toolbar" class="gow-pro-toolbar">');
            $('<button>').text('Reset camera').on('click', function(){ if (gr_instance && gr_instance.resetCamera) gr_instance.resetCamera(); }).appendTo($bar);
            $('<button>').text('Capture PNG').on('click', function(){ if (gr_instance && gr_instance.capturePng) gr_instance.capturePng('flp_label_preview.png'); }).appendTo($bar);
            $('<span class="gow-pro-pill active">HiDPI</span>').on('click', function(){
                var v = !$(this).hasClass('active');
                $(this).toggleClass('active', v);
                if (gr_instance && gr_instance.setRenderSetting) gr_instance.setRenderSetting('highDpi', v);
            }).appendTo($bar);
            $('body').append($bar);
        }
    }, 300);
});
