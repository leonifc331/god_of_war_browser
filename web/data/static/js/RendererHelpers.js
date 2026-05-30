function grHelper_PivotMesh(size) {
    if (size == undefined) {
        size = 1000;
    }
    var vertexData = [
        size, 0, 0, -size, 0, 0,
        0, size, 0,
        0, -size, 0,
        0, 0, size,
        0, 0, -size,
    ]
    var colorData = [
        0xff, 0x00, 0x00, 0xff,
        0x00, 0x00, 0x00, 0xff,
        0x00, 0xff, 0x00, 0xff,
        0x00, 0x00, 0x00, 0xff,
        0x00, 0x00, 0xff, 0xff,
        0x00, 0x00, 0x00, 0xff,
    ]
    var indexData = [
        0, 1, 2, 3, 4, 5,
    ]

    var mesh = new grMesh(vertexData, indexData, gl.LINES);
    mesh.setBlendColors(colorData);
    return mesh;
}

function grHelper_Cube(x, y, z, size) {
    if (size == undefined) {
        size = 50;
    }
    var vertexData = [
        x - size, y - size, z - size, x + size, y - size, z - size, x + size, y + size, z - size, x - size, y + size, z - size,
        x - size, y - size, z + size, x + size, y - size, z + size, x + size, y + size, z + size, x - size, y + size, z + size,
        x - size, y - size, z - size, x - size, y + size, z - size, x - size, y + size, z + size, x - size, y - size, z + size,
        x + size, y - size, z - size, x + size, y + size, z - size, x + size, y + size, z + size, x + size, y - size, z + size,
        x - size, y - size, z - size, x - size, y - size, z + size, x + size, y - size, z + size, x + size, y - size, z - size,
        x - size, y + size, z - size, x - size, y + size, z + size, x + size, y + size, z + size, x + size, y + size, z - size,
    ]
    var indexData = [
        0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7,
        8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15,
        16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23
    ]

    return new grMesh(vertexData, indexData, gl.TRIANGLES)
}

function grHelper_CubeLines(x, y, z, size_x, size_y, size_z, diaglines = true, jointid = 0) {
    if (size_x == undefined) {
        size_x = 50;
    }
    if (size_y == undefined) {
        size_y = size_x;
    }
    if (size_z == undefined) {
        size_z = size_x;
    }

    var vertexData = [
        x - size_x, y - size_y, z - size_z, x + size_x, y - size_y, z - size_z, x + size_x, y + size_y, z - size_z, x - size_x, y + size_y, z - size_z,
        x - size_x, y - size_y, z + size_z, x + size_x, y - size_y, z + size_z, x + size_x, y + size_y, z + size_z, x - size_x, y + size_y, z + size_z,
        x - size_x, y - size_y, z - size_z, x - size_x, y + size_y, z - size_z, x - size_x, y + size_y, z + size_z, x - size_x, y - size_y, z + size_z,
        x + size_x, y - size_y, z - size_z, x + size_x, y + size_y, z - size_z, x + size_x, y + size_y, z + size_z, x + size_x, y - size_y, z + size_z,
        x - size_x, y - size_y, z - size_z, x - size_x, y - size_y, z + size_z, x + size_x, y - size_y, z + size_z, x + size_x, y - size_y, z - size_z,
        x - size_x, y + size_y, z - size_z, x - size_x, y + size_y, z + size_z, x + size_x, y + size_y, z + size_z, x + size_x, y + size_y, z - size_z,
    ]

    var indexData = diaglines ? [
        0, 1, 1, 2, 0, 2, 2, 3, 4, 5, 5, 6, 4, 6, 6, 7,
        8, 9, 9, 10, 8, 10, 10, 11, 12, 13, 13, 14, 12, 14, 14, 15,
        16, 17, 17, 18, 16, 18, 18, 19, 20, 21, 21, 22, 20, 22, 22, 23
    ] : [
        0, 1, 1, 2, 2, 3, 4, 5, 5, 6,
        8, 9, 9, 10, 10, 11, 12, 13, 13, 14,
        16, 17, 17, 18, 18, 19, 20, 21, 21, 22
    ];

    var mesh = new grMesh(vertexData, indexData, gl.LINES);
    mesh.setJointIds([0], Array(vertexData.length / 3).fill(jointid));
    return mesh;
}

function grHelper_Pivot(size) {
    var mdl = new grModel();
    mdl.addMesh(grHelper_PivotMesh(size));
    return mdl;
}

function grHelper_SphereLines(x, y, z, radius, latitudeBands, longitudeBands) {
    var vertexData = [];
    for (var latNumber = 0; latNumber <= latitudeBands; latNumber++) {
        var theta = latNumber * Math.PI / latitudeBands;
        var sinTheta = Math.sin(theta);
        var cosTheta = Math.cos(theta);

        for (var longNumber = 0; longNumber <= longitudeBands; longNumber++) {
            var phi = longNumber * 2 * Math.PI / longitudeBands;
            var sinPhi = Math.sin(phi);
            var cosPhi = Math.cos(phi);

            vertexData.push(x + radius * cosPhi * sinTheta);
            vertexData.push(y + radius * cosTheta);
            vertexData.push(z + radius * sinPhi * sinTheta);
        }
    }

    var indexData = [];
    for (var latNumber = 0; latNumber < latitudeBands; latNumber++) {
        for (var longNumber = 0; longNumber < longitudeBands; longNumber++) {
            var first = (latNumber * (longitudeBands + 1)) + longNumber;
            var second = first + longitudeBands + 1;
            indexData.push(first);
            indexData.push(second);
            //indexData.push(first + 1);

            indexData.push(second);
            indexData.push(second + 1);
            //indexData.push(first + 1);
        }
    }

    var mesh = new grMesh(vertexData, indexData, gl.LINES);
    mesh.setJointIds([0], Array(vertexData.length / 3).fill(0));
    var colorData = [];
    for (var i = 0; i < vertexData.length / 3; i++) {
        colorData.push(0x40, 0xd8, 0xff, 0xb0);
    }
    mesh.setBlendColors(colorData);
    return mesh;
}

/* ========================================================================== */
/* Pro renderer helper primitives                                               */
/* ========================================================================== */
function grHelper_Grid(size, step, y, axisEvery) {
    size = size === undefined ? 2000 : size;
    step = step === undefined ? 100 : step;
    y = y === undefined ? 0 : y;
    axisEvery = axisEvery === undefined ? 5 : axisEvery;

    var vertexData = [];
    var indexData = [];
    var colorData = [];
    var idx = 0;
    var half = size;

    function addLine(x1, z1, x2, z2, rgba) {
        vertexData.push(x1, y, z1, x2, y, z2);
        indexData.push(idx, idx + 1);
        idx += 2;
        colorData.push(rgba[0], rgba[1], rgba[2], rgba[3], rgba[0], rgba[1], rgba[2], rgba[3]);
    }

    for (var p = -half; p <= half; p += step) {
        var isAxis = Math.abs(p) < 0.0001;
        var isMajor = Math.round(Math.abs(p / step)) % axisEvery === 0;
        var clr = isAxis ? [0, 216, 255, 210] : (isMajor ? [120, 150, 180, 90] : [80, 100, 125, 50]);
        addLine(-half, p, half, p, clr);
        addLine(p, -half, p, half, clr);
    }
    var mesh = new grMesh(vertexData, indexData, gl.LINES);
    mesh.setDepthTest(false);
    mesh.setBlendColors(colorData);
    mesh.setJointIds([0], Array(vertexData.length / 3).fill(0));
    mesh.setMaskBit(0);
    return mesh;
}

function grHelper_LightDirection(length) {
    length = length || 350;
    var vertexData = [0, 0, 0, length * -0.55, length * -0.75, length * 0.35];
    var indexData = [0, 1];
    var mesh = new grMesh(vertexData, indexData, gl.LINES);
    mesh.setDepthTest(false);
    mesh.setBlendColors([255, 230, 120, 255, 255, 230, 120, 255]);
    mesh.setJointIds([0], [0, 0]);
    mesh.setMaskBit(5);
    return mesh;
}

function grHelper_BoundsFromPoints(points, color) {
    if (!points || !points.length) return undefined;
    color = color || [182, 255, 74, 180];
    var min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    var max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (var i = 0; i < points.length; i += 3) {
        min[0] = Math.min(min[0], points[i]); min[1] = Math.min(min[1], points[i + 1]); min[2] = Math.min(min[2], points[i + 2]);
        max[0] = Math.max(max[0], points[i]); max[1] = Math.max(max[1], points[i + 1]); max[2] = Math.max(max[2], points[i + 2]);
    }
    var mesh = grHelper_CubeLines(
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
        Math.max(1, (max[0] - min[0]) * 0.5),
        Math.max(1, (max[1] - min[1]) * 0.5),
        Math.max(1, (max[2] - min[2]) * 0.5),
        false
    );
    var cd = [];
    for (var j = 0; j < mesh.usedIndexes.length || j < 48; j++) cd.push(color[0], color[1], color[2], color[3]);
    try { mesh.setBlendColors(cd); } catch (e) {}
    mesh.setMaskBit(0);
    return mesh;
}
