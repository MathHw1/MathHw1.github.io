const LOG = false;

const BALL_SIZE = 38;
const BORDER_SIZE = 57;
const HOLE_RADIUS = 46;
const MIDDLE_POCKET_MOUTH = 34;   // half-width of the gap in the cushion at each middle pocket

const DELTA = 1/100;
const STEP_MS = 1000/60;   // real time between physics steps

let DISPLAY = true;
let SOUND_ON = true;
let GAME_STOPPED = true;

let KEYBOARD_INPUT_ON = true;

let TRAIN_ITER = 100;
let AI_ON = true;
let AI_PLAYER_NUM = 1;
let DISPLAY_TRAINING = false;
let AI_AIM_ERROR = 0;     // how far off the computer aims, in radians (set by the difficulty buttons)
let AI_POWER_ERROR = 0;   // how much its shot strength varies, as a share of the planned strength

const POINTS_PER_BALL = 1;
const POINTS_PER_RACK = 10;
