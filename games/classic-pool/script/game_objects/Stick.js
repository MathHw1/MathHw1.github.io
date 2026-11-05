"use strict";

function Stick(position){
    this.position = position;
    this.origin = new Vector2(970,11);
    this.shotOrigin = new Vector2(950,11);
    this.shooting = false;
    this.visible = true;
    this.rotation = 0;
    this.power = 0;
    this.trackMouse = true;
}

Stick.prototype.handleInput = function (delta) {

    if(AI_ON && Game.policy.turn === AI_PLAYER_NUM)
      return;

    if(Online.isRemoteTurn())
      return;

    if(Game.policy.turnPlayed)
      return;

    if(Keyboard.down(Keys.W) && KEYBOARD_INPUT_ON){
      if(this.power < 75){
        this.origin.x+=2;
        this.power+=1.2;
      }
    }

    if(Keyboard.down(Keys.S) && KEYBOARD_INPUT_ON){
      if(this.power>0){
        this.origin.x-=2;
        this.power-=1.2;
      }
    }

    else if (this.power>0 && Mouse.left.down){
      this.shoot(this.power, this.rotation);
    }
    else if(this.trackMouse){
      // Point from the mouse to the ball, so the cue sits on the side you click or drag to
      // and the shot goes away from it, like pulling a real cue back. (It used to point at
      // the mouse, which put the cue on the opposite side of the ball.)
      var opposite = this.position.y - Mouse.position.y;
      var adjacent = this.position.x - Mouse.position.x;
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