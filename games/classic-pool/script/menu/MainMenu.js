
// Makes a copy of a menu button image with different text on it (used for "Extreme",
// which has no image of its own): covers the old word with the button colour and writes the new one.
function relabelButton(sprite, text){
    let canvas = document.createElement("canvas");
    canvas.width = sprite.width;
    canvas.height = sprite.height;
    let ctx = canvas.getContext("2d");
    ctx.drawImage(sprite, 0, 0);

    let p = ctx.getImageData(30, Math.round(sprite.height / 2), 1, 1).data;
    ctx.fillStyle = "rgb(" + p[0] + "," + p[1] + "," + p[2] + ")";
    ctx.fillRect(24, 16, sprite.width - 48, sprite.height - 34);

    ctx.fillStyle = "#ffffff";
    ctx.font = "100 62px 'Helvetica Neue', 'Segoe UI Light', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, sprite.width / 2, sprite.height / 2 - 2);
    return canvas;
}

function generateMainMenuLabels(headerText){

    let labels = [

        new Label(
            headerText, 
            new Vector2(100,0),
            Vector2.zero,
            "white",
            "left",
            "Bookman",
            "100px"
        ),
        new Label(
            "© 2018 Chen Shmilovich", 
            new Vector2(1250,700),
            Vector2.zero,
            "white",
            "left",
            "Bookman",
            "20px"
        )
    ];


    return labels;
}


function generateMainMenuButtons(inGame){



    let buttons = [];

    let dev = 0;

    if(inGame){
        dev = 200;
        buttons.push(
            new Button
                (
                    // CONTINUE BUTTON
                    sprites.continueButton, 
                    new Vector2(200,200),
                    function(){
                        Game.mainMenu.active = false;
                        GAME_STOPPED = false;
                        setTimeout(Game.continueGame,200);
                        sounds.fadeOut(Game.mainMenu.sound);
                    },
                    sprites.continueButtonHover
                )
        )
    }

    let muteSprite = sprites.muteButton;
    let muteSpriteHover = sprites.muteButtonHover;

    if(Game.mainMenu.sound && Game.mainMenu.sound.volume === 0){
        muteSprite = sprites.muteButtonPressed;
        muteSpriteHover = sprites.muteButtonPressedHover;
    }


    let muteButton = new Button
    (
        // MUTE BUTTON
        muteSprite, 
        new Vector2(1430,10),
        function(){
            if(Game.mainMenu.sound.volume == 0){
                SOUND_ON = true;
                Game.mainMenu.sound.volume = 0.8;
                this.sprite = sprites.muteButton;
                this.hoverSprite = sprites.muteButtonHover;
            }
            else{
                SOUND_ON = false;
                Game.mainMenu.sound.volume = 0.0;
                this.sprite = sprites.muteButtonPressed;
                this.hoverSprite = sprites.muteButtonPressedHover;
            }
        },
        muteSpriteHover
    );

    let backButton = new Button
    (
        //BACK
        sprites.backButton, 
        new Vector2(100,150),
        function(){
            Game.mainMenu.labels = generateMainMenuLabels("Classic 8-Ball");
            Game.mainMenu.buttons = generateMainMenuButtons(inGame);
        },
        sprites.backButtonHover
    );

    buttons = buttons.concat([
        new Button
        (
            // PLAYER vs PLAYER
            sprites.twoPlayersButton, 
            new Vector2(200,dev+200),
            function(){
                AI_ON = false;
                Game.mainMenu.active = false;
                GAME_STOPPED = false;
                setTimeout(Game.startNewGame,200);
                sounds.fadeOut(Game.mainMenu.sound);
            },
            sprites.twoPlayersButtonHover
        ),
        new Button
        (
            // PLAYER vs COMPUTER
            sprites.onePlayersButton, 
            new Vector2(200,dev+400),
            function(){
                Game.mainMenu.labels = generateMainMenuLabels("Choose Difficulty");

                Mouse.reset();
                Game.mainMenu.buttons = [
                    new Button
                    (
                        //EASY
                        sprites.easyButton, 
                        new Vector2(200,150),
                        function(){
                            AI_PLAYER_NUM = 1;
                            AI_ON = true;
                            TRAIN_ITER = 30;
                            AI_AIM_ERROR = 0.06;      // about 3.5 degrees off
                            AI_POWER_ERROR = 0.15;
                            Game.mainMenu.active = false;
                            GAME_STOPPED = false;
                            setTimeout(Game.startNewGame,200);
                            sounds.fadeOut(Game.mainMenu.sound);
                        },
                        sprites.easyButtonHover
                    ),
                    new Button
                    (
                        //MEDIUM
                        sprites.mediumButton, 
                        new Vector2(200,300),
                        function(){
                            AI_PLAYER_NUM = 1;
                            AI_ON = true;
                            TRAIN_ITER = 50;
                            AI_AIM_ERROR = 0.03;      // about 1.7 degrees off
                            AI_POWER_ERROR = 0.08;
                            Game.mainMenu.active = false;
                            GAME_STOPPED = false;
                            setTimeout(Game.startNewGame,200);
                            sounds.fadeOut(Game.mainMenu.sound);
                        },
                        sprites.mediumButtonHover
                    ),
                    new Button
                    (
                        //HARD
                        sprites.hardButton, 
                        new Vector2(200,450),
                        function(){
                            AI_PLAYER_NUM = 1;
                            AI_ON = true;
                            TRAIN_ITER = 100;
                            AI_AIM_ERROR = 0.012;     // under 1 degree off
                            AI_POWER_ERROR = 0.04;
                            Game.mainMenu.active = false;
                            GAME_STOPPED = false;
                            setTimeout(Game.startNewGame,200);
                            sounds.fadeOut(Game.mainMenu.sound);
                        },
                        sprites.hardButtonHover
                    ),
                    new Button
                    (
                        //EXTREME (the original "insane" computer: breaks first and never misses)
                        relabelButton(sprites.insaneButton, "EXTREME"), 
                        new Vector2(200,600),
                        function(){
                            AI_PLAYER_NUM = 0;
                            AI_ON = true;
                            TRAIN_ITER = 700;
                            AI_AIM_ERROR = 0;
                            AI_POWER_ERROR = 0;
                            Game.mainMenu.active = false;
                            GAME_STOPPED = false;
                            setTimeout(Game.startNewGame,200);
                            sounds.fadeOut(Game.mainMenu.sound);
                        },
                        relabelButton(sprites.insaneButtonHover, "EXTREME")
                    ),
                    muteButton,
                    backButton

                ];
            },
            sprites.onePlayersButtonHover
        ),
        muteButton
    ]);

    return buttons;
}