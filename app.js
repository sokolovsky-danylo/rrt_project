Module.onRuntimeInitialized = function () {

  const rrt_run        = Module.cwrap('rrt_run',        'number', ['number','number','number','number']);
  const clear_circles  = Module.cwrap('clear_circles',  null,     []);
  const add_circle     = Module.cwrap('add_circle',     null,     ['number','number','number']);
  const get_node_count = Module.cwrap('get_node_count', 'number', []);
  const get_node_x     = Module.cwrap('get_node_x',     'number', ['number']);
  const get_node_y     = Module.cwrap('get_node_y',     'number', ['number']);
  const get_node_parent= Module.cwrap('get_node_parent','number', ['number']);
  const get_path_length= Module.cwrap('get_path_length','number', []);

  const canvas = document.getElementById('canvas');
  const ctx    = canvas.getContext('2d');
  const status = document.getElementById('status');

  const BRUSH_SIZE = 15;
  const BRUSH_R    = BRUSH_SIZE / 2;

  const sliderStep  = document.getElementById('slider-step');
  const sliderBias  = document.getElementById('slider-bias');
  const sliderSpeed = document.getElementById('slider-speed');
  const valStep     = document.getElementById('val-step');
  const valBias     = document.getElementById('val-bias');
  const valSpeed    = document.getElementById('val-speed');

  sliderStep.oninput  = () => valStep.textContent  = sliderStep.value;
  sliderBias.oninput  = () => valBias.textContent  = sliderBias.value;
  sliderSpeed.oninput = () => valSpeed.textContent = sliderSpeed.value;

  let mode      = 'wall';
  let strokes   = [];
  let curStroke = null;
  let startPt   = null;
  let endPt     = null;
  let treeEdges = [];
  let pathPts   = [];
  let isDrawing = false;
  let animationCancelled = false;

  const btnWall  = document.getElementById('btn-wall');
  const btnStart = document.getElementById('btn-start');
  const btnEnd   = document.getElementById('btn-end');
  const btnRun   = document.getElementById('btn-run');
  const btnClear = document.getElementById('btn-clear');

  function setMode(m) {
    mode = m;
    [btnWall, btnStart, btnEnd].forEach(b => b.classList.remove('active'));
    if (m === 'wall')  btnWall.classList.add('active');
    if (m === 'start') btnStart.classList.add('active');
    if (m === 'end')   btnEnd.classList.add('active');
    const labels = {
      wall:  '🧱 Click and drag to draw walls.',
      start: '🟢 Click anywhere to place the start point.',
      end:   '🔴 Click anywhere to place the end point.'
    };
    status.textContent = labels[m];
  }

  btnWall.onclick  = () => setMode('wall');
  btnStart.onclick = () => setMode('start');
  btnEnd.onclick   = () => setMode('end');

  btnClear.onclick = () => {  
    animationCancelled = true;  
    strokes = []; curStroke = null;
    startPt = null; endPt = null;
    treeEdges = []; pathPts = [];
    status.textContent = 'Canvas cleared. Start fresh!';
    redraw();
  };

  function uploadStrokesToC() {
    clear_circles();
    for (const stroke of strokes) {
      for (let i = 0; i < stroke.length; i++) {
        add_circle(stroke[i].x, stroke[i].y, BRUSH_R);
        if (i < stroke.length - 1) {
          const ax = stroke[i].x,   ay = stroke[i].y;
          const bx = stroke[i+1].x, by = stroke[i+1].y;
          const dx = bx - ax, dy = by - ay;
          const segLen = Math.sqrt(dx*dx + dy*dy);
          const steps  = Math.ceil(segLen / (BRUSH_R * 0.5));
          for (let s = 1; s < steps; s++) {
            const t = s / steps;
            add_circle(ax + t*dx, ay + t*dy, BRUSH_R);
          }
        }
      }
    }
  }
  btnRun.onclick = () => {
  animationCancelled = false;  
    if (!startPt) { status.textContent = '⚠️ Please set a start point first.'; return; }
    if (!endPt)   { status.textContent = '⚠️ Please set an end point first.';  return; }

    uploadStrokesToC();

    status.textContent = '⏳ Running RRT...';
    setTimeout(() => {
      const stepSize = parseFloat(sliderStep.value);
      const goalBias = parseFloat(sliderBias.value) / 100.0;
      const found    = rrt_run(startPt.x, startPt.y, endPt.x, endPt.y, stepSize, goalBias);

      treeEdges = [];
      const nc = get_node_count();
      for (let i = 1; i < nc; i++) {
        const p = get_node_parent(i);
        if (p >= 0) {
          treeEdges.push({
            x1: get_node_x(p), y1: get_node_y(p),
            x2: get_node_x(i), y2: get_node_y(i)
          });
        }
      }

      pathPts = [];
      if (found) {
        let cur = get_node_count() - 1;
        while (cur !== -1) {
          pathPts.unshift({ x: get_node_x(cur), y: get_node_y(cur) });
          cur = get_node_parent(cur);
        }
      }

      const allEdges  = treeEdges.slice();
      const finalPath = pathPts.slice();
      treeEdges = [];
      pathPts   = [];

      const EDGES_PER_FRAME = parseInt(sliderSpeed.value);
      let edgeIndex = 0;

      function animateTree() {
        if (animationCancelled) return;
        for (let i = 0; i < EDGES_PER_FRAME && edgeIndex < allEdges.length; i++, edgeIndex++) {
          treeEdges.push(allEdges[edgeIndex]);
        }
        redraw();
        if (edgeIndex < allEdges.length) {
          status.textContent = `🔍 Exploring... ${edgeIndex} / ${allEdges.length} nodes`;
          requestAnimationFrame(animateTree);
        } else {
          animatePath(0);
        }
      }

      function animatePath(i) {
        if (animationCancelled) return;   
        if (i <= finalPath.length) {
          pathPts = finalPath.slice(0, i);
          redraw();
          if (i < finalPath.length) {
            setTimeout(() => animatePath(i + 1), 10);
          } else {
            status.textContent = found
              ? `✅ Path found! ${finalPath.length} waypoints, ${allEdges.length} nodes explored.`
              : '❌ No path found. Try removing some walls or moving the points.';
          }
        }
      }

      requestAnimationFrame(animateTree);
    }, 20);
  };

  function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('mousedown', e => {
    const pos = canvasPos(e);
    if (mode === 'wall') {
      isDrawing = true;
      curStroke = [pos];
      treeEdges = []; pathPts = [];
    } else if (mode === 'start') {
      startPt = pos;
      treeEdges = []; pathPts = [];
      status.textContent = '🟢 Start placed. Set an end point or run!';
      redraw();
    } else if (mode === 'end') {
      endPt = pos;
      treeEdges = []; pathPts = [];
      status.textContent = '🔴 End placed. Press ▶ Run RRT when ready!';
      redraw();
    }
  });

  canvas.addEventListener('mousemove', e => {
    if (mode !== 'wall' || !isDrawing) return;
    curStroke.push(canvasPos(e));
    redraw();
  });

  canvas.addEventListener('mouseup', () => {
    if (mode !== 'wall' || !isDrawing) return;
    if (curStroke && curStroke.length > 1) strokes.push(curStroke);
    curStroke = null;
    isDrawing = false;
    redraw();
  });

  canvas.addEventListener('mouseleave', () => {
    if (mode === 'wall' && isDrawing && curStroke && curStroke.length > 1) {
      strokes.push(curStroke);
    }
    curStroke = null;
    isDrawing = false;
  });

  function drawStroke(stroke, color) {
    if (!stroke || stroke.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth   = BRUSH_SIZE;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
    ctx.stroke();
  }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    strokes.forEach(s => drawStroke(s, '#29087b'));
    if (curStroke) drawStroke(curStroke, '#0257a18d');

    ctx.strokeStyle = '#3a3a6a';
    ctx.lineWidth   = 1;
    treeEdges.forEach(e => {
      ctx.beginPath();
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
    });

    if (pathPts.length > 1) {
      ctx.strokeStyle = '#ffcc00cd';
      ctx.lineWidth   = 10;
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      ctx.moveTo(pathPts[0].x, pathPts[0].y);
      pathPts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }

    if (startPt) {
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(startPt.x, startPt.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('S', startPt.x, startPt.y);
    }

    if (endPt) {
      ctx.fillStyle = '#e67e22';
      ctx.beginPath();
      ctx.arc(endPt.x, endPt.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('E', endPt.x, endPt.y);
    }
  }

  setMode('wall');
  redraw();
};