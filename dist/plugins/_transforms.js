"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var regTransformTypes = /matrix|translate|scale|rotate|skewX|skewY/;
var regTransformSplit = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*(.+?)\s*\)[\s,]*/;
var regNumericValues = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
/**
 * Convert transform string to JS representation.
 *
 * @param {String} transformString input string
 * @param {Object} params plugin params
 * @return {Array} output array
 */
function transform2js(transformString) {
    // JS representation of the transform data
    var transforms = [];
    // current transform context
    var current;
    // split value into ['', 'translate', '10 50', '', 'scale', '2', '', 'rotate', '-45', '']
    transformString.split(regTransformSplit).forEach(function (item) {
        var num;
        if (item) {
            // if item is a translate function
            if (regTransformTypes.test(item)) {
                // then collect it and change current context
                transforms.push((current = { name: item }));
                // else if item is data
            }
            else {
                // then split it into [10, 50] and collect as context.data
                while ((num = regNumericValues.exec(item))) {
                    num = Number(num);
                    if (current.data) {
                        current.data.push(num);
                    }
                    else {
                        current.data = [num];
                    }
                }
            }
        }
    });
    // Return empty array if broken transform (no data).
    return current && current.data ? transforms : [];
}
exports.transform2js = transform2js;
/**
 * Multiply transforms into one.
 *
 * @param {Array} input transforms array
 * @return {Array} output matrix array
 */
function transformsMultiply(transforms) {
    // convert transforms objects to the matrices
    transforms = transforms.map(function (transform) {
        if (transform.name === 'matrix') {
            return transform.data;
        }
        return transformToMatrix(transform);
    });
    // multiply all matrices into one
    transforms = {
        name: 'matrix',
        data: transforms.length > 0 ? transforms.reduce(multiplyTransformMatrices) : [],
    };
    return transforms;
}
exports.transformsMultiply = transformsMultiply;
/**
 * Do math like a school girl.
 *
 * @type {Object}
 */
exports.mth = {
    rad: function (deg) {
        return deg * Math.PI / 180;
    },
    deg: function (rad) {
        return rad * 180 / Math.PI;
    },
    cos: function (deg) {
        return Math.cos(this.rad(deg));
    },
    acos: function (val, floatPrecision) {
        return +this.deg(Math.acos(val)).toFixed(floatPrecision);
    },
    sin: function (deg) {
        return Math.sin(this.rad(deg));
    },
    asin: function (val, floatPrecision) {
        return +this.deg(Math.asin(val)).toFixed(floatPrecision);
    },
    tan: function (deg) {
        return Math.tan(this.rad(deg));
    },
    atan: function (val, floatPrecision) {
        return +this.deg(Math.atan(val)).toFixed(floatPrecision);
    },
};
/**
 * Decompose matrix into simple transforms. See
 * http://www.maths-informatique-jeux.com/blog/frederic/?post/2013/12/01/Decomposition-of-2D-transform-matrices
 *
 * @param {Object} data matrix transform object
 * @return {Object|Array} transforms array or original transform object
 */
function matrixToTransform(transform, params) {
    var floatPrecision = params.floatPrecision;
    var data = transform.data;
    var transforms = [];
    var sx = +Math.sqrt(data[0] * data[0] + data[1] * data[1]).toFixed(params.transformPrecision);
    var sy = +((data[0] * data[3] - data[1] * data[2]) / sx).toFixed(params.transformPrecision);
    var colsSum = data[0] * data[2] + data[1] * data[3];
    var rowsSum = data[0] * data[1] + data[2] * data[3];
    var scaleBefore = rowsSum || +(sx == sy);
    // [..., ..., ..., ..., tx, ty] → translate(tx, ty)
    if (data[4] || data[5]) {
        transforms.push({
            name: 'translate',
            data: data.slice(4, data[5] ? 6 : 5),
        });
    }
    // [sx, 0, tan(a)·sy, sy, 0, 0] → skewX(a)·scale(sx, sy)
    if (!data[1] && data[2]) {
        transforms.push({
            name: 'skewX',
            data: [exports.mth.atan(data[2] / sy, floatPrecision)],
        });
        // [sx, sx·tan(a), 0, sy, 0, 0] → skewY(a)·scale(sx, sy)
    }
    else if (data[1] && !data[2]) {
        transforms.push({
            name: 'skewY',
            data: [exports.mth.atan(data[1] / data[0], floatPrecision)],
        });
        sx = data[0];
        sy = data[3];
        // [sx·cos(a), sx·sin(a), sy·-sin(a), sy·cos(a), x, y] → rotate(a[, cx, cy])·(scale or skewX) or
        // [sx·cos(a), sy·sin(a), sx·-sin(a), sy·cos(a), x, y] → scale(sx, sy)·rotate(a[, cx, cy]) (if !scaleBefore)
    }
    else if (!colsSum || (sx == 1 && sy == 1) || !scaleBefore) {
        if (!scaleBefore) {
            sx =
                (data[0] < 0 ? -1 : 1) *
                    Math.sqrt(data[0] * data[0] + data[2] * data[2]);
            sy =
                (data[3] < 0 ? -1 : 1) *
                    Math.sqrt(data[1] * data[1] + data[3] * data[3]);
            transforms.push({ name: 'scale', data: [sx, sy] });
        }
        var rotate = [
            exports.mth.acos(data[0] / sx, floatPrecision) * (data[1] * sy < 0 ? -1 : 1),
        ];
        if (rotate[0]) {
            transforms.push({ name: 'rotate', data: rotate });
        }
        if (rowsSum && colsSum) {
            transforms.push({
                name: 'skewX',
                data: [exports.mth.atan(colsSum / (sx * sx), floatPrecision)],
            });
        }
        // rotate(a, cx, cy) can consume translate() within optional arguments cx, cy (rotation point)
        if (rotate[0] && (data[4] || data[5])) {
            transforms.shift();
            var cos = data[0] / sx;
            var sin = data[1] / (scaleBefore ? sx : sy);
            var x = data[4] * (scaleBefore || sy);
            var y = data[5] * (scaleBefore || sx);
            var denom = (Math.pow(1 - cos, 2) + Math.pow(sin, 2)) * (scaleBefore || sx * sy);
            rotate.push(((1 - cos) * x - sin * y) / denom);
            rotate.push(((1 - cos) * y + sin * x) / denom);
        }
        // Too many transformations, return original matrix if it isn't just a scale/translate
    }
    else if (data[1] || data[2]) {
        return transform;
    }
    if ((scaleBefore && (sx != 1 || sy != 1)) || !transforms.length) {
        transforms.push({
            name: 'scale',
            data: sx == sy ? [sx] : [sx, sy],
        });
    }
    return transforms;
}
exports.matrixToTransform = matrixToTransform;
/**
 * Convert transform to the matrix data.
 *
 * @param {Object} transform transform object
 * @return {Array} matrix data
 */
function transformToMatrix(transform) {
    if (transform.name === 'matrix') {
        return transform.data;
    }
    var matrix;
    switch (transform.name) {
        case 'translate':
            // [1, 0, 0, 1, tx, ty]
            matrix = [1, 0, 0, 1, transform.data[0], transform.data[1] || 0];
            break;
        case 'scale':
            // [sx, 0, 0, sy, 0, 0]
            matrix = [
                transform.data[0],
                0,
                0,
                transform.data[1] || transform.data[0],
                0,
                0,
            ];
            break;
        case 'rotate':
            // [cos(a), sin(a), -sin(a), cos(a), x, y]
            var cos = exports.mth.cos(transform.data[0]);
            var sin = exports.mth.sin(transform.data[0]);
            var cx = transform.data[1] || 0;
            var cy = transform.data[2] || 0;
            matrix = [
                cos,
                sin,
                -sin,
                cos,
                (1 - cos) * cx + sin * cy,
                (1 - cos) * cy - sin * cx,
            ];
            break;
        case 'skewX':
            // [1, 0, tan(a), 1, 0, 0]
            matrix = [1, 0, exports.mth.tan(transform.data[0]), 1, 0, 0];
            break;
        case 'skewY':
            // [1, tan(a), 0, 1, 0, 0]
            matrix = [1, exports.mth.tan(transform.data[0]), 0, 1, 0, 0];
            break;
    }
    return matrix;
}
/**
 * Applies transformation to an arc. To do so, we represent ellipse as a matrix, multiply it
 * by the transformation matrix and use a singular value decomposition to represent in a form
 * rotate(θ)·scale(a b)·rotate(φ). This gives us new ellipse params a, b and θ.
 * SVD is being done with the formulae provided by Wolffram|Alpha (svd {{m0, m2}, {m1, m3}})
 *
 * @param {Array} arc [a, b, rotation in deg]
 * @param {Array} transform transformation matrix
 * @return {Array} arc transformed input arc
 */
function transformArc(arc, transform) {
    var a = arc[0];
    var b = arc[1];
    var rot = arc[2] * Math.PI / 180;
    var cos = Math.cos(rot);
    var sin = Math.sin(rot);
    var h = Math.pow(arc[5] * cos + arc[6] * sin, 2) / (4 * a * a) +
        Math.pow(arc[6] * cos - arc[5] * sin, 2) / (4 * b * b);
    if (h > 1) {
        h = Math.sqrt(h);
        a *= h;
        b *= h;
    }
    var ellipse = [a * cos, a * sin, -b * sin, b * cos, 0, 0];
    var m = multiplyTransformMatrices(transform, ellipse);
    // Decompose the new ellipse matrix
    var lastCol = m[2] * m[2] + m[3] * m[3];
    var squareSum = m[0] * m[0] + m[1] * m[1] + lastCol;
    var root = Math.sqrt((Math.pow(m[0] - m[3], 2) + Math.pow(m[1] + m[2], 2)) *
        (Math.pow(m[0] + m[3], 2) + Math.pow(m[1] - m[2], 2)));
    if (!root) {
        // circle
        arc[0] = arc[1] = Math.sqrt(squareSum / 2);
        arc[2] = 0;
    }
    else {
        var majorAxisSqr = (squareSum + root) / 2;
        var minorAxisSqr = (squareSum - root) / 2;
        var major = Math.abs(majorAxisSqr - lastCol) > 1e-6;
        var sub = (major ? majorAxisSqr : minorAxisSqr) - lastCol;
        var rowsSum = m[0] * m[2] + m[1] * m[3];
        var term1 = m[0] * sub + m[2] * rowsSum;
        var term2 = m[1] * sub + m[3] * rowsSum;
        arc[0] = Math.sqrt(majorAxisSqr);
        arc[1] = Math.sqrt(minorAxisSqr);
        arc[2] =
            ((major ? term2 < 0 : term1 > 0) ? -1 : 1) *
                Math.acos((major ? term1 : term2) / Math.sqrt(term1 * term1 + term2 * term2)) *
                180 /
                Math.PI;
    }
    if (transform[0] < 0 !== transform[3] < 0) {
        // Flip the sweep flag if coordinates are being flipped horizontally XOR vertically
        arc[4] = 1 - arc[4];
    }
    return arc;
}
exports.transformArc = transformArc;
/**
 * Multiply transformation matrices.
 *
 * @param {Array} a matrix A data
 * @param {Array} b matrix B data
 * @return {Array} result
 */
function multiplyTransformMatrices(a, b) {
    return [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
    ];
}
