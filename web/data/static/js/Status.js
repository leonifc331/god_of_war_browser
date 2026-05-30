'use strict';

var wsStatusSocket;
var wsStatusTimeout = false;

function gowWsStatusTimer() {
    if (wsStatusSocket) {
        wsStatusSocket.close();
    }
    wsStatusSocket = undefined;
    if (!wsStatusTimeout) {
        wsStatusTimeout = true;
        var delay = Math.min(15000, Math.round((window.__gowWsRetryDelay || 1000) * 1.45));
        window.__gowWsRetryDelay = delay;
        setTimeout(gowWsStatusConnect, delay);
    }
}

function gowWsStatusConnect() {
    wsStatusTimeout = false;
    console.info("Trying to connect to ws server");
    if (window["WebSocket"]) {
        wsStatusSocket = new WebSocket((document.location.protocol === "https:" ? "wss://" : "ws://") + document.location.host + "/ws/status");
        wsStatusSocket.onclose = function(evt) {
            console.info("SOCKET CLOSED", evt);
            $("#status").removeClass("gow-ws-online").addClass("gow-ws-offline");
            gowWsStatusTimer();
        };
        wsStatusSocket.onerror = function(evt) {
            console.error("SOCKET ERROR", evt);
            $("#status").removeClass("gow-ws-online").addClass("gow-ws-offline");
            gowWsStatusTimer();
        }
        wsStatusSocket.onmessage = function(evt) {
            window.__gowWsRetryDelay = 1000;
            $("#status").removeClass("gow-ws-offline").addClass("gow-ws-online");
            var s = JSON.parse(evt.data);
            var $sp = $("#status-progress");
            var $st = $("#status-text");
            $st.text(s.Message);
            $sp.removeClass("info error progress");
            switch (s.Type) {
                case 0:
                    $sp.addClass("info");
                    $sp.width("100%");
                    break;
                case 1:
                    $sp.addClass("error");
                    $sp.width("100%");
                    break;
                case 2:
                    $sp.addClass("progress");
                    var progress = s.Progress;
                    if (progress > 1) {
                        progress = 1;
                    }
                    if (progress < 0) {
                        progress = 0;
                    }
                    $sp.width(progress * 100 + "%");
                    break;
            }
        };
    } else {
        console.warn("Your browser do not support websocket");
    }
}

$(document).ready(function() {
    $(window).on('beforeunload', function() {
        if (wsStatusSocket) {
            wsStatusSocket.close();
        }
    });
    gowWsStatusConnect();
});

/* Keep a readable status if the websocket is disabled by a static test server. */
$(document).ready(function() {
    setTimeout(function() {
        if (!wsStatusSocket || wsStatusSocket.readyState > 1) {
            $('#status').addClass('gow-ws-offline');
            if (!$('#status-text').text()) $('#status-text').text('servidor de status indisponível');
        }
    }, 2500);
});
