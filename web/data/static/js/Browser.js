'use strict';

var viewPack, viewTree, viewSummary, view3d;
var dataPack, dataTree, dataSummary, data3d;
var defferedLoadingWad;
var defferedLoadingWadNode;
var dataSelectors, dataSummarySelectors;
var wad_last_load_view_type = 'nodes';

// --- Helper Functions ---

String.prototype.replaceAll = function(search, replace) {
    if (replace === undefined) {
        return this.toString();
    }
    return this.replace(new RegExp('[' + search + ']', 'g'), replace);
};

function getActionLinkForWadNode(wad, nodeid, action, params = '') {
    return '/action/' + wad + '/' + nodeid + '/' + action + '?' + params;
}

function treeInputFilterHandler($el, localStorageKey) {
    var filterText = $el.val().toLowerCase();
    if (localStorageKey) {
        localStorage.setItem(localStorageKey, filterText);
    }
    $el.parent().find("div li label").each(function(a1, a2, a3) {
        var p = $(this).parent();
        if ($(this).text().toLowerCase().includes(filterText)) {
            while (p.is("li")) {
                p.show();
                p = p.parent().parent();
            }
        } else {
            p.hide();
        }
    });
};

function treePackInputFilterHandler() {
    treeInputFilterHandler($(this), 'tree-filter');
};

function treeItemInputFilterHandler() {
    treeInputFilterHandler($(this), 'item-filter');
};

function set3dVisible(show) {
    if (show) {
        view3d.show();
        viewSummary.attr('style', '');
        // Garante que o resize aconteça após mostrar o elemento
        setTimeout(() => {
            if (typeof gr_instance !== 'undefined') {
                gr_instance.setInterfaceCameraMode(false);
                gr_instance.onResize();
            }
        }, 50);
    } else {
        view3d.hide();
        viewSummary.attr('style', 'flex-grow:1;');
    }
}

function setTitle(view, title) {
    $(view).children(".view-item-title").text(title);
}

function setLocation(title, hash) {
    $("head title").text(title);
    if (window.history.pushState) {
        window.history.pushState(null, title, hash);
    } else {
        window.location.hash = hash;
    }
}

// --- Data Loading Functions ---

function packLoad() {
    dataPack.empty();
    dataSelectors.empty();
    $.getJSON('/json/pack', function(files) {
        var list = $('<ol>');
        for (var i in files) {
            var fileName = files[i];
            list.append($('<li>')
                .attr('filename', fileName)
                .append($('<label>').append(fileName))
                .append($('<a download>')
                    .addClass('button-dump')
                    .attr('title', 'Download file')
                    .attr('href', '/dump/pack/' + fileName))
                .append($('<div>')
                    .addClass('button-upload')
                    .attr('title', 'Upload your version of file')
                    .attr("href", '/upload/pack/' + fileName)
                    .click(uploadAjaxHandler)));
        }
        dataPack.append(list);

        if (defferedLoadingWad) {
            packLoadFile(defferedLoadingWad);
        }

        $('#view-pack ol li label').click(function(ev) {
            packLoadFile($(this).parent().attr('filename'));
        });

        $('#view-pack-filter').trigger('input');

        console.log('pack loaded');
    })
}

function uploadAjaxHandler() {
    var link = $(this).attr("href");
    var form = $('<form action="' + link + '" method="post" enctype="multipart/form-data">');
    var fileInput = $('<input type="file" name="data">');
    form.append(fileInput);

    fileInput.trigger("click");
    fileInput.change(function() {
        if (fileInput[0].files.length == 0) {
            return;
        }

        $.ajax({
            url: form.attr('action'),
            type: 'post',
            data: new FormData(form[0]),
            processData: false,
            contentType: false,
            success: function(a1) {
                if (a1 !== "") {
                    alert('Error uploading: ' + a1);
                } else {
                    alert('Modificado!');
                    window.location.reload();
                }
            }
        });
    });
}

function packLoadFile(filename) {
    dataTree.empty();
    dataSummary.empty();
    dataSelectors.empty();
    // Assuming flp_obj_view_history is global or defined elsewhere
    window.flp_obj_view_history = [{
        TypeArrayId: 8,
        IdInThatTypeArray: 0
    }];
    
    $.getJSON('/json/pack/' + filename, function(data) {
        var ext = filename.slice(-3).toLowerCase();
        switch (ext) {
            case 'wad':
            case 'ps3':
            case 'sp2':
                treeLoadWad(filename, data);
                break;
            case 'psw':
            case 'pss':
                treeLoadPswPss(filename, data);
                break;
            case 'vag':
            case 'va1':
            case 'va2':
            case 'va3':
            case 'va4':
            case 'va5':
            case 'vpk':
            case 'vp1':
            case 'vp2':
            case 'vp3':
            case 'vp4':
                treeLoadVagVpk(filename, data);
                break;
            case 'txt':
                treeLoadTxt(filename, data);
                break;
            default:
                dataTree.append(JSON.stringify(data, undefined, 2).replaceAll('\n', '<br>'));
                break;
        }
        console.log('pack file ' + filename + ' Carregado');
    });
}

function treeLoadVagVpk(filename, data) {
    set3dVisible(false);
    setTitle(viewTree, filename);
    var list = $("<ul>");
    var wavPath = '/dump/pack/' + filename + '/wav';

    list.append($("<li>").append("SampleRate: " + data.SampleRate));
    list.append($("<li>").append("Canais: " + data.Channels));
    list.append($("<li>").append($("<a>").attr("href", wavPath).append("Download WAV")));
    dataTree.append(list)

    dataTree.append($("<audio controls autoplay>").append($("<source>").attr("src", wavPath)));

    setLocation(filename, '#/' + filename);
}

function treeLoadTxt(filename, data) {
    set3dVisible(false);
    setTitle(viewTree, filename);
    dataSummary.append($("<p>").append(data));
    setLocation(filename, '#/' + filename);
}

function treeLoadPswPss(filename, data) {
    set3dVisible(true);
    setTitle(viewTree, filename);
    
    var videoPath = '/dump/pack/' + filename;
    var videoContainer = $('<div class="video-container">');
    var videoElement = $('<video controls width="640" height="360">');
    var sourceElement = $('<source>').attr('src', videoPath);
    
    videoElement.append(sourceElement);
    videoContainer.append(videoElement);
    videoContainer.append('<p class="video-fallback">Seu navegador não suporta o elemento de vídeo.</p>');
    
    // Limpa a view 3D para mostrar o vídeo
    $('.view-item-container').empty().append(videoContainer);
    
    videoElement.on('error', function() {
        console.error('Erro ao carregar o vídeo:', videoPath);
        videoContainer.html('<div class="video-error">Erro ao carregar o vídeo: ' + filename + '</div>');
    });
    
    setLocation(filename, '#/' + filename);
}

function treeLoadWad(wadName, data) {
    setTitle(viewTree, wadName);
    if (!defferedLoadingWadNode) {
        setLocation(wadName, '#/' + wadName);
    }

    dataSelectors.append($('<div class="item-selector">').click(function() {
        treeLoadWadAsNodes(wadName, data);
    }).text("Nodes"));
    dataSelectors.append($('<div class="item-selector">').click(function() {
        treeLoadWadAsTags(wadName, data);
    }).text("Tags"));

    if (wad_last_load_view_type === 'nodes') {
        treeLoadWadAsNodes(wadName, data);
    } else if (wad_last_load_view_type === 'tags') {
        treeLoadWadAsTags(wadName, data);
    }
}

// --- Modern 3D UI & Styling ---

function injectModernStyles() {
    const css = `
        /* 3D View Container Modernization */
        #view-3d {
            position: relative;
            background: #111; /* Fundo padrão mais escuro */
            overflow: hidden;
        }

        .view-item-container {
            width: 100%;
            height: 100%;
        }

        /* Floating Toolbar */
        .modern-3d-toolbar {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(30, 30, 30, 0.85);
            backdrop-filter: blur(10px);
            padding: 8px 16px;
            border-radius: 12px;
            display: flex;
            gap: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.1);
            z-index: 100;
            transition: opacity 0.3s;
        }

        .modern-3d-toolbar:hover {
            opacity: 1;
            background: rgba(30, 30, 30, 0.95);
        }

        /* Toolbar Groups */
        .toolbar-group {
            display: flex;
            align-items: center;
            gap: 8px;
            padding-right: 12px;
            border-right: 1px solid rgba(255,255,255,0.15);
        }
        .toolbar-group:last-child {
            border-right: none;
            padding-right: 0;
        }

        /* Toggle Buttons */
        .modern-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 8px;
            cursor: pointer;
            background: transparent;
            border: 1px solid transparent;
            color: #aaa;
            transition: all 0.2s;
            position: relative;
        }

        .modern-toggle:hover {
            background: rgba(255,255,255,0.1);
            color: #fff;
        }

        .modern-toggle.active {
            background: #3498db;
            color: white;
            box-shadow: 0 0 10px rgba(52, 152, 219, 0.4);
        }

        .modern-toggle i {
            font-style: normal;
            font-weight: bold;
            font-size: 14px;
        }
        
        /* Tooltip simples */
        .modern-toggle::after {
            content: attr(data-title);
            position: absolute;
            bottom: 120%;
            left: 50%;
            transform: translateX(-50%);
            background: #000;
            color: #fff;
            padding: 4px 8px;
            font-size: 11px;
            border-radius: 4px;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s;
            white-space: nowrap;
        }
        .modern-toggle:hover::after {
            opacity: 1;
        }

        /* Color Picker Reset */
        .color-picker-wrapper input[type="color"] {
            width: 24px;
            height: 24px;
            border: none;
            padding: 0;
            background: none;
            cursor: pointer;
        }

        /* Video Styles */
        .video-container {
            padding: 20px;
            background: #1e1e1e;
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            height: 100%;
        }
        video {
            max-width: 100%;
            max-height: 80vh;
            background: #000;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .video-fallback, .video-error {
            color: #fff;
            margin-top: 10px;
            padding: 10px;
            background: #d32f2f;
            border-radius: 4px;
        }
    `;
    $('<style>').text(css).appendTo('head');
}

function createModernToolbar() {
    const $container = $('#view-3d');
    
    // Remove configuração antiga se existir
    $('#view-3d-config').hide(); 

    const $toolbar = $('<div class="modern-3d-toolbar">');

    // Grupo 1: Visualização
    const $groupVis = $('<div class="toolbar-group">');
    
    // Helper para criar botões
    const createBtn = (id, label, title, initial = false) => {
        const $btn = $(`<div class="modern-toggle" id="${id}" data-title="${title}"><i>${label}</i></div>`);
        if(initial) $btn.addClass('active');
        return $btn;
    };

    // Botões de Toggle (Skeleton, Entity, Collision, Light)
    // Mapeando para as máscaras de bits usadas anteriormente
    const toggles = [
        { id: 'btn-skel-ids', label: 'ID', title: 'Show Skeleton IDs', bit: 1 },
        { id: 'btn-skel', label: 'SK', title: 'Show Skeleton', bit: 2 },
        { id: 'btn-ent', label: 'EN', title: 'Show Entity', bit: 3 },
        { id: 'btn-col', label: 'CL', title: 'Show Collision', bit: 4 },
        { id: 'btn-light', label: 'LI', title: 'Show Lights', bit: 5 }
    ];

    toggles.forEach(t => {
        const selectorKey = `#view-3d-config input#show-${t.title.toLowerCase().replace(/ /g, '-')}`; // Mantendo compatibilidade com key antiga se necessário, ou criando nova
        const storageKey = `modern_view_${t.bit}`; // Chave nova para evitar conflitos
        
        const $btn = createBtn(t.id, t.label, t.title);
        
        // Estado inicial
        const isChecked = localStorage.getItem(storageKey) === "true";
        if(isChecked) $btn.addClass('active');

        $btn.click(function() {
            const isActive = $(this).toggleClass('active').hasClass('active');
            // Lógica bitmask original
            if (typeof gr_instance !== 'undefined') {
                const bit = 1 << t.bit;
                gr_instance.setFilterMask((gr_instance.filterMask & (~bit)) | (isActive ? bit : 0));
                gr_instance.requestRedraw();
            }
            localStorage.setItem(storageKey, isActive);
        });

        $groupVis.append($btn);
    });

    // Grupo 2: Configurações Globais
    const $groupSettings = $('<div class="toolbar-group">');

    // Backface Culling
    const $btnCull = createBtn('btn-cull', 'BC', 'Toggle Backface Culling');
    const cullState = localStorage.getItem('modern_cull') === "true";
    if(cullState) $btnCull.addClass('active');
    
    $btnCull.click(function() {
        const enable = $(this).toggleClass('active').hasClass('active');
        if (typeof gr_instance !== 'undefined') {
            gr_instance.cull = enable;
            gr_instance.requestRedraw();
        }
        localStorage.setItem('modern_cull', enable);
    });
    $groupSettings.append($btnCull);

    // Background Color Picker
    const $colorWrapper = $('<div class="modern-toggle color-picker-wrapper" data-title="Background Color">');
    const $colorInput = $('<input type="color" value="#111111">');
    
    $colorInput.on('input', function() {
        $('#view-3d').css('background-color', $(this).val());
        // Se o renderizador suportar limpar com cor transparente, o CSS define o fundo
    });
    
    $colorWrapper.append($colorInput);
    $groupSettings.append($colorWrapper);

    // Grupo 3: Ações
    const $groupActions = $('<div class="toolbar-group" style="border:none">');
    
    // Fullscreen
    const $btnFull = createBtn('btn-full', 'FS', 'Fullscreen');
    $btnFull.click(function() {
        const el = document.getElementById('view-3d');
        goFullscreen(el);
    });
    $groupActions.append($btnFull);

    // Montagem final
    $toolbar.append($groupVis, $groupSettings, $groupActions);
    $container.append($toolbar);
}

function goFullscreen(element) {
    if (element.requestFullscreen) {
        element.requestFullscreen();
    } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
    } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
    }
}

// --- Initialization ---

$(document).ready(function() {
    viewPack = $('#view-pack');
    viewTree = $('#view-tree');
    viewSummary = $('#view-summary');
    view3d = $('#view-3d');

    dataPack = viewPack.children('.view-item-container');
    dataTree = viewTree.children('.view-item-container');
    dataSelectors = viewTree.children('.view-item-selectors');
    dataSummary = viewSummary.children('.view-item-container');
    dataSummarySelectors = viewSummary.children('.view-item-selectors');
    data3d = view3d.children('.view-item-container');

    // Filtros
    var packFilter = localStorage.getItem('tree-filter');
    var itemFilter = localStorage.getItem('item-filter');
    $('#view-pack-filter').on('input', treePackInputFilterHandler).val(packFilter ? packFilter : '.wad');
    $('#view-item-filter').on('input', treeItemInputFilterHandler).val(itemFilter ? itemFilter : '');

    // URL Parsing
    var urlParts = decodeURI(window.location.hash).split("/");
    if (urlParts.length > 1 && urlParts[1].length > 0) {
        defferedLoadingWad = urlParts[1];
    }
    if (urlParts.length > 2 && urlParts[2].length > 0) {
        defferedLoadingWadNode = urlParts[2];
    }

    // Inicialização do Sistema
    injectModernStyles(); // 1. Injeta CSS
    packLoad();
    
    // Inicializa renderizador (mantendo lógica original)
    if (typeof gwInitRenderer === 'function') {
        gwInitRenderer(data3d);
    } else {
        console.warn('gwInitRenderer not found - 3D context may be missing');
    }

    // 2. Cria Toolbar Moderna e vincula lógica
    createModernToolbar();
    
    // Inicializa Analytics (se houver)
    if (typeof gaInit === 'function') gaInit();
});

function hexdump(buffer, blockSize) {
    var table = $('<table>');
    blockSize = blockSize || 16;
    var lines = [];
    var hex = "0123456789ABCDEF";
    var blocks = Math.ceil(buffer.length / blockSize);
    for (var iBlock = 0; iBlock < blocks; iBlock += 1) {
        var blockPos = iBlock * blockSize;

        var line = '';
        var chars = '';
        for (var j = 0; j < Math.min(blockSize, buffer.length - blockPos); j += 1) {
            var code = buffer[blockPos + j];
            line += ' ' + hex[(0xF0 & code) >> 4] + hex[0x0F & code];
            chars += (code > 0x20 && code < 0x80) ? String.fromCharCode(code) : '.';
        }

        var tr = $('<tr>');
        tr.append($('<td>').append(("000000" + blockPos.toString(16)).slice(-6)));
        tr.append($('<td>').append(line));
        tr.append($('<td>').text(chars));
        table.append(tr);
    }
    return table;
}

/* ========================================================================== */
/* GoW Browser Pro global UI controls                                           */
/* ========================================================================== */
function gowProHexToRgb(hex) {
    var n = parseInt(hex.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

function gowProApplySetting(key, value) {
    if (typeof gr_instance === 'undefined' || !gr_instance) return;
    if (key === 'backgroundColor') gr_instance.setBackgroundColor(value);
    else if (gr_instance.setRenderSetting) gr_instance.setRenderSetting(key, value);
    localStorage.setItem('gow-pro-' + key, JSON.stringify(value));
}

function gowProReadSetting(key, fallback) {
    try {
        var raw = localStorage.getItem('gow-pro-' + key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
}

function createGowProRendererPanel() {
    var $view = $('#view-3d');
    if (!$view.length || $('#gow-pro-render-panel').length) return;

    var $panel = $('<div id="gow-pro-render-panel" class="gow-pro-panel">');
    $panel.append($('<h3>').text('Render Pro'));

    function slider(label, key, min, max, step, fallback) {
        var val = gowProReadSetting(key, fallback);
        var $input = $('<input type="range">').attr({min:min, max:max, step:step}).val(val);
        var $num = $('<span class="gow-muted">').text(val);
        $input.on('input', function() {
            var v = parseFloat(this.value);
            $num.text(v.toFixed(2));
            gowProApplySetting(key, v);
        });
        var $line = $('<label>').append($('<span>').text(label)).append($('<div>').append($input).append($num));
        $panel.append($line);
        setTimeout(function(){ gowProApplySetting(key, val); }, 120);
    }

    slider('Ambient', 'ambient', 0, 1.5, 0.01, 0.42);
    slider('Diffuse', 'diffuse', 0, 2.0, 0.01, 0.85);
    slider('Specular', 'specular', 0, 1.5, 0.01, 0.28);
    slider('Exposure', 'exposure', 0.1, 3.0, 0.01, 1.08);
    slider('Gamma', 'gamma', 1.0, 3.2, 0.01, 2.2);

    var bg = gowProReadSetting('backgroundColor', '#090d14');
    var $bg = $('<input type="color">').val(bg);
    $bg.on('input', function(){ gowProApplySetting('backgroundColor', this.value); });
    $panel.append($('<label>').append($('<span>').text('Background')).append($bg));

    var textureMode = gowProReadSetting('textureFiltering', 'smooth');
    var $tex = $('<select>').append('<option value="smooth">smooth + anisotropic</option><option value="sharp">sharp mipmap</option><option value="pixel">pixel/nearest</option>').val(textureMode);
    $tex.on('change', function(){ gowProApplySetting('textureFiltering', this.value); });
    $panel.append($('<label>').append($('<span>').text('Texture')).append($tex));
    setTimeout(function(){ gowProApplySetting('textureFiltering', textureMode); }, 150);

    var $row = $('<div class="gow-row">');
    function pill(text, key, fallback) {
        var val = gowProReadSetting(key, fallback);
        var $p = $('<span class="gow-pro-pill">').text(text).toggleClass('active', !!val);
        $p.on('click', function() {
            var v = !$(this).hasClass('active');
            $(this).toggleClass('active', v);
            gowProApplySetting(key, v);
        });
        $row.append($p);
        setTimeout(function(){ gowProApplySetting(key, val); }, 160);
    }
    pill('Grid', 'showGrid', true);
    pill('HiDPI', 'highDpi', true);
    pill('Rotate', 'autoRotate', false);
    $panel.append($row);

    var $actions = $('<div class="gow-row">');
    $('<button>').text('Reset camera').on('click', function(){ if (gr_instance && gr_instance.resetCamera) gr_instance.resetCamera(); }).appendTo($actions);
    $('<button>').text('PNG').on('click', function(){ if (gr_instance && gr_instance.capturePng) gr_instance.capturePng(); }).appendTo($actions);
    $('<button>').text('Hide').on('click', function(){ $panel.toggle(); }).appendTo($actions);
    $panel.append($actions);

    $view.append($panel);
}

function installGowProTableEnhancer() {
    if (window.__gowProTableEnhancer) return;
    window.__gowProTableEnhancer = true;
    var enhance = function() {
        $('#view-summary .view-item-container').each(function() {
            var $root = $(this);
            if ($root.find('.gow-filter-box').length || !$root.find('table').length) return;
            var $box = $('<div class="gow-filter-box">');
            var $input = $('<input type="search" placeholder="Filtrar tabela/summary...">');
            $input.on('input', function() {
                var q = this.value.toLowerCase();
                $root.find('table tr').each(function() {
                    var $tr = $(this);
                    if (!$tr.closest('.gow-filter-box').length) $tr.toggle($tr.text().toLowerCase().indexOf(q) >= 0);
                });
            });
            $box.append($input);
            $root.prepend($box);
        });
    };
    var obs = new MutationObserver(function(){ window.requestAnimationFrame(enhance); });
    obs.observe(document.getElementById('view-summary'), {childList:true, subtree:true});
    enhance();
}

function installGowProKeybindings() {
    if (window.__gowProKeys) return;
    window.__gowProKeys = true;
    $(document).on('keydown', function(ev) {
        if ($(ev.target).is('input, textarea, select')) return;
        if (!gr_instance) return;
        switch (ev.key.toLowerCase()) {
            case 'r': if (gr_instance.resetCamera) gr_instance.resetCamera(); break;
            case 'p': if (gr_instance.capturePng) gr_instance.capturePng(); break;
            case 'g': gowProApplySetting('showGrid', !(gr_instance.renderSettings && gr_instance.renderSettings.showGrid)); break;
            case 'c': gr_instance.cull = !gr_instance.cull; gr_instance.requestRedraw(); break;
            case ' ': if (typeof ga_instance !== 'undefined' && ga_instance) { ga_instance.paused = !ga_instance.paused; } break;
        }
    });
}

function installGowProBrowserEnhancements() {
    createGowProRendererPanel();
    installGowProTableEnhancer();
    installGowProKeybindings();
}

$(document).ready(function() {
    setTimeout(installGowProBrowserEnhancements, 250);
});
