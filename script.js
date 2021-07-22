/*
CONTRIBUTORS:
Jacob deGroot-Maggetti
Daniel Manesh
Yoshi Sono
George Michel
*/

let grid;

const rows = 10;
let cols = 8;

let cellSize = 30;

let dimX = cols * cellSize;
let dimY = rows * cellSize;
let offsetX = 50;
let offsetY = 50;

let kajarGap = 15; // space in pixels between main grid and kajar grid

let canvasWidth;
let canvasHeight;

let patternLengthInput;
let playButton;

let volumeSliderLeft;
let volumeLeft;

let volumeSliderRight;
let volumeRight;

let volumeSliderKajar;
let volumeKajar;

let tempoSlider;
let tempo;

let playLoop = false;

let loop;
let currentBeat = -1;

let snapshotButton;

let samples;

let loaded = false;

/*
TODO:
- make notes play as user clicks on grid (debug!)
- make clicking work on mobile devices
- Different interlocking types (i.e. elaborate a melody)
  - this would be a good opportunity to refactor
- save and load patterns?
  - would be not that difficult to save into a json file, right? all we need to save is the state of grid.grid and grid.kajarRow
- export audio?

*/



let gangsaTopHue = 40;
let gangsaBottomHue = 98;
const COLORS = {
  "GangsaTop": {
    inPattern: {
      active: [gangsaTopHue, 100, 100],
      inactive: [gangsaTopHue, 100, 0],
    },
    outOfPattern: {
      active: [gangsaTopHue, 50, 100],
      inactive: [gangsaTopHue, 25, 100],
    }
  },
  "GangsaBottom": {
    inPattern: {
      active: [gangsaBottomHue, 100, 100],
      inactive: [gangsaBottomHue, 100, 0],
    },
    outOfPattern: {
      active: [gangsaBottomHue, 50, 100],
      inactive: [gangsaBottomHue, 25, 95],
    }
  },
};

function initializeSamples() {
  let names = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(i => `samples/${i}.wav`);

  // envs[i] -> speakers/"destination"
  let envs = names.map( _ => {
    return env = new Tone.AmplitudeEnvelope({ // Audio node 
		  attack: 0.0,
		  decay: 0.0,
		  sustain: 1.0,
		  release: 0.2,
	  }).toDestination();  // Plug it in to the sound system
  });

  // panner[i] -> env[i] -> speakers
  let panNodes = names.map( (_, idx) => {
    let env = envs[idx];
    return new Tone.Panner(-1).connect(env);
  });

  // gain[i] -> panner[i] -> env[i] -> speakers
  let gainNodes = names.map( (_, idx) => {
    const pan = panNodes[idx];
    return new Tone.Gain(1).connect(pan)
  })

  // sample[i] -> gain[i] ->  panner[i] -> env[i] -> speakers
  let samplePlayers = names.map( (name, idx) => {
    const gain = gainNodes[idx];
    let result = new Tone.Player(name);
    result.connect(gain);
    return new Tone.Player(name).connect(gain);
  });

  let kajarGainNode = new Tone.Gain(1).toDestination()
  let kajarSample = new Tone.Player('samples/kempli.wav').connect(kajarGainNode)

  Tone.loaded().then(() => {
    playButton.removeAttribute('disabled');
    playButton.html('Play');
    loaded = true;
  });

  samples = {
    "gangsa": samplePlayers,
    "gangsa-envelopes": envs,
    "pan-nodes": panNodes,
    "gain-nodes": gainNodes,
    "kajar": kajarSample,
    "kajar-gain": kajarGainNode
  };
}


function makeEmptyOnsetsGrid(x, y) {
  // create an empty grid of onsets with dimensions x by y
  return Array(x).fill(false).map(_ => Array(y).fill(false));
}

class Grid {
  constructor() {
    this.grid = makeEmptyOnsetsGrid(cols, 4);
    this.pitchOffsets = Array(cols).fill(4) // offsets from top
    this.kajarRow = Array(cols).fill(false)
    this.demo()
  }

  fillForNote(x, y) {
    let offset = this.pitchOffsets[x];
    if (y < offset || y >= offset + 4) { // notes that are not part of either player's pattern
      fill(0, 0, 90);
      return;
    }

    y -= offset

    let instrument = y <= 1 ? "GangsaTop" : "GangsaBottom";
    let inPattern = this.grid[x][y] ? "inPattern" : "outOfPattern";
    let activeBeat = (playLoop && (currentBeat === x)) ? "active" : "inactive";

    fill(...COLORS[instrument][inPattern][activeBeat]);    
  }

  draw() {
    // draw current state of the onsets grid
    colorMode(HSB, 100);

    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        this.fillForNote(x, y);
        rect(x * cellSize + offsetX, y * cellSize + offsetY, cellSize, cellSize);
      }
    }

    for (let x = 0; x < cols; x++) {
      if (grid.kajarRow[x] === true) {
        fill(100, 0, 0)
      } else if (grid.kajarRow[x] === false) {
        fill(0, 0, 90)
      }
      rect(x * cellSize + offsetX, dimY + offsetY + kajarGap, cellSize, cellSize);
    }
  }

  playGangsa(beat, time) {
    if (!loaded) {
      return
    } 
    console.log("Tone.transport.seconds: ", Tone.Transport.seconds);
    console.log(`playgangsa(${beat}, ${time})`);
    this.grid[beat].forEach((inPattern, y) => {
      Tone.Transport.bpm.value = tempo;
      let duration = 60/Tone.Transport.bpm.value/2; // seconds per minute / tempo / eighth notes per quarter note

      let pan = (y === 0 || y === 1) ? -0.5 : 0.5;
      let gain = (y === 0 || y === 1) ? volumeLeft : volumeRight;
      
      if (inPattern) {
        samples["gangsa"][y + grid.pitchOffsets[beat]].start(time);
        samples["gangsa-envelopes"][y + grid.pitchOffsets[beat]].triggerAttackRelease(duration, time);
        samples["pan-nodes"][y + grid.pitchOffsets[beat]].pan.setValueAtTime(pan, time);
        samples["gain-nodes"][y + grid.pitchOffsets[beat]].gain.setValueAtTime(gain, time);
      }
    });
  }

  playKajar(beat, time) {
    // console.log("Time:", time);
    // console.log("Tone.Transport.seconds: ", Tone.Transport.seconds);

    if (!loaded) {
      return
    }

    if (this.kajarRow[beat] === true) {
      samples["kajar-gain"].gain.setValueAtTime(volumeKajar, time)
      samples["kajar"].start(time);
    }
  }

  play(time) {
    this.playGangsa(currentBeat, time);
    this.playKajar(currentBeat, time);
  }

  // (x, y) spans the entire grid (not just this.grid)
  handleGridClick(x, y) {
    let offset = this.pitchOffsets[x];

    // console.log('handleClick(). x:', x, 'y:', y, 'offset:', offset)

    if (y < offset) {
      this.setPitchOffset(x, y);
    } else if (y-3 > offset) {
      this.setPitchOffset(x, y-3);
    } else {
      this.harmonize(x, y-offset);
    }

    if (!playLoop) {
      this.playGangsa(x, Tone.Transport.seconds);
    }
  }

  handleKajarClick(x) {
    this.kajarRow[x] = !this.kajarRow[x]

    if (!playLoop) {
      this.playKajar(x, Tone.Transport.seconds);
    }
  }

  // sets pitchOffset[x] AND subsequent pitchOffsets until a
  // note is encountered.
  setPitchOffset(x, offset) {
    // console.log('setPitchOffsets. x:', x, 'offset:', offset)
    this.pitchOffsets[x] = offset;
    if (x+1 < cols && this.grid[x+1].every(val => val === false)) {
      this.setPitchOffset(x+1, offset);
    }
  }

  harmonize(x, y) {
    if (this.grid[x][y] === true) { // if cell is currently true, change entire onset to false
      this.grid[x] = [false, false, false, false];
    } else { // if cell is currently false, change to true, change harmonizing note to true (if necessary), and change all other notes to false
      if (y === 0 || y === 3) {
        // harmonize notes 0 and 3
        this.grid[x] = [true, false, false, true];
      } else if (y === 1) {
        this.grid[x] = [false, true, false, false];
      } else if (y === 2) {
        this.grid[x] = [false, false, true, false];
      }
    }
  }

  demo() {
    this.grid[0] = [true, false, false, true];
    this.grid[1] = [false, true, false, false];
    this.grid[2] = [true, false, false, true];
    this.grid[3] = [false, false, true, false];
    this.grid[4] = [false, true, false, false];
    this.grid[5] = [true, false, false, true];
    this.grid[6] = [false, true, false, false];
    this.grid[7] = [false, false, true, false];

    this.kajarRow = [true, false, false, false, true, false, false, false]
  }
}

// Use touchStarted instead of mouseClicked to accomodate mobile
// devices.
function touchStarted() {

  if (!loop) {
    loop = new Tone.Loop(onOnset, "8n"); // .start(0);
    Tone.start();
    Tone.Transport.start();
    loop.mute = true;
    loop.start(0);
  }

  let x = mouseX;
  let y = mouseY - 3; // - 3 in order to properly match vertical mouse position

  if (x > offsetX && x < dimX + offsetX && y > offsetY && y < dimY + offsetY) {
    let gridX = Math.floor((x - offsetX) / cellSize);
    let gridY = Math.floor((y - offsetY) / cellSize);
    grid.handleGridClick(gridX, gridY);
  }

  if (x > offsetX && x < dimX + offsetX
      && y > dimY + offsetY + kajarGap && y < dimY + offsetY + kajarGap + cellSize) {
    let kajarX = Math.floor((x - offsetX) / cellSize);
    grid.handleKajarClick(kajarX);
  }
}


// TODO: move to top of file, maybe
function onOnset(time) {
  currentBeat = (currentBeat + 1) % cols;  // Actually, send to the grid thing.
  grid.play(time);
}


function toggleCurrentlyPlaying() {
  playLoop = !playLoop;
  playButton.html(playLoop ? 'Pause' : 'Play');
  
  // If loop hasn't been initialized, do it now!
  if (!loop) {
    loop = new Tone.Loop(onOnset, "8n"); // .start(0);
    Tone.start();
    Tone.Transport.start();
    loop.start(0);
  }

  // playLoop ? Tone.Transport.start() : Tone.Transport.stop();
  let t = Tone.Transport.seconds;
  loop.mute = !playLoop;
  if (!playLoop) currentBeat = -1;
}

function resizeGrid() {
  let newCols = Math.floor(patternLengthInput.value());

  while (cols != newCols) {
    if (cols < newCols) {
      grid.grid.push([false, false, false, false]);
      grid.kajarRow.push(false)
      let offset = cols == 0 ? 3 : grid.pitchOffsets[cols-1];
      grid.pitchOffsets.push(offset);
      cols ++;
    } else if (cols > newCols) {
      grid.grid.pop();
      grid.kajarRow.pop();
      grid.pitchOffsets.pop();
      cols --;
    }

    console.log(grid.kajarRow)

    dimX = cols * cellSize;
  }

  // ensure canvas is large enough to display entire grid
  if (dimX + (offsetX * 2) > canvasWidth) {
    canvasWidth += 400
    resizeCanvas(canvasWidth, canvasHeight)
  }

}

function takeSnapshot() {
  let patternArea = get(offsetX - 1, offsetY - 1, dimX + 2, dimY + kajarGap + cellSize + 2);
  let patternCanvas = patternArea['canvas']

  let d = new Date();
  dateTimeString = d.toISOString().substring(0, 19);

  saveCanvas(patternCanvas, `ngempat-pattern-${dateTimeString}`, 'png');
}

function createButtonsAndSliders() {

  offsetFromTop = offsetY + dimY + kajarGap + cellSize

  playButton = createButton('Loading...');
  playButton.attribute('disabled', '');
  playButton.position(offsetX + 10, offsetFromTop + 30);
  playButton.mousePressed(toggleCurrentlyPlaying);

  patternLengthInput = createInput("8", "number");
  patternLengthInput.size(50);
  patternLengthInput.position(offsetX + 90, offsetFromTop + 30);
  patternLengthInput.input(resizeGrid);

  volumeSliderLeft = createSlider(0, 1, 1, 0.1);
  volumeSliderLeft.position(offsetX + 5, offsetFromTop + 65);
  volumeSliderLeft.style('width', '80px');

  volumeSliderRight = createSlider(0, 1, 1, 0.1);
  volumeSliderRight.position(offsetX + 105, offsetFromTop + 65);
  volumeSliderRight.style('width', '80px');

  volumeSliderKajar = createSlider(0, 1, 1, 0.1);
  volumeSliderKajar.position(offsetX + 205, offsetFromTop + 65);
  volumeSliderKajar.style('width', '80px');

  tempoSlider = createSlider(25, 400, 120, 5);
  tempoSlider.position(offsetX + 5, offsetFromTop + 90);
  tempoSlider.style('width', '280px');

  snapshotButton = createButton('Export Snapshot');
  snapshotButton.position(offsetX + 10, offsetFromTop + 125);
  snapshotButton.mousePressed(takeSnapshot);

}

function updateGainAndTempo() {
  volumeLeft = volumeSliderLeft.value();
  volumeRight = volumeSliderRight.value();
  volumeKajar = volumeSliderKajar.value();
  tempo = tempoSlider.value();
}




function preload() {
  createButtonsAndSliders();
  initializeSamples();
}

function setup() {
  canvasWidth = windowWidth;
  canvasHeight = windowHeight;
  createCanvas(canvasWidth, canvasHeight);
  background(255);

  grid = new Grid();
}

function draw() {
  background(255);
  grid.draw();
  updateGainAndTempo();
}
