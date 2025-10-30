const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl', {antialias: true});

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const vertexShaderSource = `
    attribute vec4 a_position;
    void main() {
        gl_Position = a_position;
    }
`;

const fragmentShaderSource = `
    precision mediump float;

    uniform vec2 u_resolution;
    uniform int u_numPoints;
    uniform vec3 u_points[15]; // Adjust size as needed
    uniform float u_k;

    uniform int u_showEquipotential;
    uniform float u_EquipotentialScale;

    void main() {
        vec2 position = gl_FragCoord.xy;

        float sum = 0.0;

        for(int i = 0; i < 15; i++) {
            if(i >= u_numPoints) break;
            sum += u_points[i].z / distance(u_points[i].xy, position);
        }

        gl_FragColor = vec4(u_k * sum, 0., -u_k * sum, 1.);

        float potential = u_k * sum;

        if(u_showEquipotential == 1) {

            float scale = u_EquipotentialScale;

            for(int j = 0; j <= 100; j++) {
                float targetPotential = (float(j) - 50.) / scale;
                float distanceThreshold = 0.001;
                float isEquipotential = step(targetPotential - distanceThreshold, potential) *
                                step(potential, targetPotential + distanceThreshold);

                if(isEquipotential > 0.0) { gl_FragColor = vec4(1,1,1,1); }
            }
        }
    }
`;


let shaderProgram;

const initShaders = () => {
    const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);

    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program:', gl.getProgramInfoLog(shaderProgram));
    }
};

const compileShader = (gl, source, type) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred while compiling the shader:', gl.getShaderInfoLog(shader));
    }
    return shader;
};


const render = () => {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(shaderProgram);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        1, 1
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(shaderProgram, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const u_k = gl.getUniformLocation(shaderProgram, 'u_k');
    gl.uniform1f(u_k, constants.k);

    const u_numPoints = gl.getUniformLocation(shaderProgram, 'u_numPoints');
    gl.uniform1i(u_numPoints, charges.length);

    const u_points = gl.getUniformLocation(shaderProgram, 'u_points');
    const flatPoints = charges.flatMap(p => [p.x, canvas.height - p.y, p.q]);
    gl.uniform3fv(u_points, flatPoints);

    const u_resolution = gl.getUniformLocation(shaderProgram, 'u_resolution');
    gl.uniform2f(u_resolution, canvas.width, canvas.height);

    const u_showEquipotential = gl.getUniformLocation(shaderProgram, "u_showEquipotential");
    gl.uniform1i(u_showEquipotential, constants.show_equipotential ? 1 : 0);

    const u_equipotentialScale = gl.getUniformLocation(shaderProgram, "u_EquipotentialScale");
    gl.uniform1f(u_equipotentialScale, constants.equipotentialScale);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

let constants = {
    k: 5.0,
    show_equipotential: false,
    equipotentialScale: 5
};
let charges = [
    {index: 1, x: canvas.width / 4, y: canvas.height / 2, q: 10}, 
    {index: 2, x: 3 * canvas.width / 4, y: canvas.height / 2, q: 10}
];
let point_counter = 2;

const setupGUI = () => {
    const gui = new dat.GUI();
    
    gui.add(constants, "k", 0.1, 10.0).onChange(render);

    const equipotentialFolder = gui.addFolder("Equipotential");
    equipotentialFolder.add(constants, "show_equipotential", false).name("Show").onChange(render);
    equipotentialFolder.add(constants, "equipotentialScale", 1, 50).name("Scale").onChange(render);
    
    const pointsFolder = gui.addFolder('Charges');

    const updatePoints = () => {
        render();
    };

    const addPointController = (point) => {
        const pointFolder = pointsFolder.addFolder(`Point ${point.index}`);
        pointFolder.add(point, 'x', 0, canvas.width).onChange(updatePoints);
        pointFolder.add(point, 'y', 0, canvas.height).onChange(updatePoints);
        pointFolder.add(point, 'q', -10, 10).onChange(updatePoints);
        pointFolder.add({ remove: () => {
            charges.splice(charges.indexOf(point), 1);
            charges = charges.filter(charge => charge.index != point.index);
            pointsFolder.removeFolder(pointFolder);
            updatePoints();
        }}, 'remove').name('Remove');
    };

    charges.forEach(addPointController);
    
    gui.add({ add: () => {
        const newPoint = { index: ++point_counter, x: canvas.width / 2, y: canvas.height / 2, q: 10 };
        charges.push(newPoint);
        addPointController(newPoint);
        updatePoints();
    }}, 'add').name('Add Point');

    pointsFolder.open();
};

window.onload = () => {
    initShaders();
    setupGUI();
    render();
};


// Allow for the dragging of points

let selectedPoint = undefined;
let selectionOffset = {x: 0, y: 0};

document.addEventListener('mousemove', (event) => {

    if(selectedPoint != undefined) {
        selectedPoint.x = event.x + selectionOffset.x;
        selectedPoint.y = event.y + selectionOffset.y;
        render();
        return;
    }

    let hovering = false;

    for(let point of charges) {
        let distance = Math.sqrt(Math.pow(point.x - event.x, 2) + Math.pow(point.y - event.y, 2));

        if(distance < 30) {
            document.body.style.cursor = 'all-scroll';
            hovering = true;
        }
    }

    if(!hovering) {
        document.body.style.cursor = '';
    }
});

document.addEventListener('mousedown', (event) => {
    for(let point of charges) {
        let distance = Math.sqrt(Math.pow(point.x - event.x, 2) + Math.pow(point.y - event.y, 2));

        if(distance < 30) {
            selectedPoint = point;
            selectionOffset = {
                x: point.x - event.x,
                y: point.y - event.y
            };
            break;
        }
    }
});

document.addEventListener('mouseup', (event) => {
    selectedPoint = undefined;
    document.body.style.cursor = '';
})


// Prevent annoying resizing bugs
// This isn't ideal, but acceptable since it is just for playing around with the numbers
document.addEventListener('resize', (event) => {
    window.location.reload();
});