"use strict";

const KEY_TURN_SPEED = 0.025;

function Stick(position){
    this.position = position;
    this.origin = new Vector2(970,11);
    this.shotOrigin = new Vector2(950,11);
    this.shooting = false;
    this.visible = true;
    this.rotation = 0;
    this.power = 0;
    this.trackMouse = true;
    this.keyAiming = false;
    this.spaceHeld = false;
}

Stick.prototype.handleInput = function (delta) {

    if(AI_ON && Game.policy.turn === AI_PLAYER_NUM)
      return;

    if(Online.isRemoteTurn())
      return;

    if(Game.policy.turnPlayed)
      return;

    // Arrow keys or WASD turn the cue. Left and right are quick, up and down are for fine aiming.
    var turn = 0;
    if(KEYBOARD_INPUT_ON){
      if(Keyboard.down(Keys.left) || Keyboard.down(Keys.A)) turn -= 1;
      if(Keyboard.down(Keys.right) || Keyboard.down(Keys.D)) turn += 1;
      if(Keyboard.down(Keys.up) || Keyboard.down(Keys.W)) turn -= 0.2;
      if(Keyboard.down(Keys.down) || Keyboard.down(Keys.S)) turn += 0.2;
    }
    if(turn !== 0){
      this.rotation += turn * KEY_TURN_SPEED;
      this.keyAiming = true;
    }

    // Hold Space to build power, and let go to shoot.
    if(Keyboard.down(Keys.space) && KEYBOARD_INPUT_ON){
      this.spaceHeld = true;
      if(this.power < 75){
        this.origin.x+=2;
        this.power+=1.2;
      }
    }
    else if(this.spaceHeld){
      this.spaceHeld = false;
      if(this.power>0) this.shoot(this.power, this.rotation);
      return;
    }

    var moved = Mouse.position.x !== this.lastMouseX || Mouse.position.y !== this.lastMouseY;
    this.lastMouseX = Mouse.position.x;
    this.lastMouseY = Mouse.position.y;
    if(moved) this.keyAiming = false;

    if(this.trackMouse && !this.keyAiming){
      // The cue points at the mouse or finger, so the ball goes where you're aiming.
      var opposite = Mouse.position.y - this.position.y;
      var adjacent = Mouse.position.x - this.position.x;
      this.rotation = Math.atan2(opposite, adjacent);
    }
};

Stick.prototype.shoot = function(power, rotation){
  Online.sendShot(power, rotation);   // does nothing outside online games

  this.power = power;
  this.rotation = rotation;

  if(Game.sound && SOUND_ON){
    var strike = sounds.strike.cloneNode(true);
    strike.volume = (this.power/(10))<1?(this.power/(10)):1;
    strike.play();
  }
  Game.policy.turnPlayed = true;
  this.shooting = true;
  this.origin = this.shotOrigin.copy();

  Game.gameWorld.whiteBall.shoot(this.power, this.rotation);
  var stick = this;
  setTimeout(function(){stick.visible = false;}, 500);
}

Stick.prototype.update = function(){
  if(this.shooting && !Game.gameWorld.whiteBall.moving)
    this.reset();
};

Stick.prototype.reset = function(){
  this.position.x = Game.gameWorld.whiteBall.position.x;
  this.position.y = Game.gameWorld.whiteBall.position.y;
	this.origin = new Vector2(970,11);
  this.shooting = false;
  this.visible = true;
	this.power = 0;
};

Stick.prototype.draw = function () {
  if(!this.visible)
    return;
  Canvas2D.drawImage(sprites.stick, this.position,this.rotation,1, this.origin);
};