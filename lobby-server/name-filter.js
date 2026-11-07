"use strict";

// Keeps rude usernames off the public boards. Names are boiled down first, so leetspeak, repeated
// letters and characters stuck in the middle of a word don't get past it.

const LOOK_ALIKES = { 0: 'O', 1: 'I', 2: 'Z', 3: 'E', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B', 9: 'G', '@': 'A', $: 'S', '!': 'I', '|': 'I', '+': 'T' };

// Checked against the name with spaces and symbols taken out.
const BLOCKED = [
    /N[IY]GG/, /N[IY]GE?R/, /N[IY]GA/, /N.GG.R/, /NEGRO/, /FAG/, /DYKE/, /TRANN/, /RETARD/, /CHINK/, /KIKE/, /GOOK/, /WETBACK/, /BEANER/,
    /FUC?K/, /FACK/, /FUK/, /FCK/, /PHUK/, /SHIT/, /BITCH/, /BICH/, /CUNT/, /DICK/, /(?<!PEA)COCK/, /PUSSY/, /PENIS/, /VAGIN/, /BOOB/, /TITS/, /TITTIE/, /TITTY/, /ASSH/, /SLUT/, /WHORE/, /JIZZ/, /SEXY/, /PORN/, /RAPIS/, /NAZI/, /HITLER/, /KKK/, /WANK/, /TWAT/, /BASTARD/, /MOLEST/, /PEDO/
];
// These turn up inside normal words like PHOENIX, GRAPE and RACCOON, so they must be the whole name.
const BLOCKED_WHOLE = /^(ASS|ASSES|ARSE|DAMN|PISS|CRAP|HOE|HOES|SEX|CUM|RAPE|RAPER|SPIC|COON|SHT)$/;

function boil(name) {
    return String(name).toUpperCase()
        .replace(/[0-9@$!|+]/g, ch => LOOK_ALIKES[ch])
        .replace(/[^A-Z]/g, '')
        .replace(/(.)\1+/g, '$1$1');
}

function isRude(name) {
    const boiled = boil(name), once = boiled.replace(/(.)\1/g, '$1');
    return BLOCKED.some(rule => rule.test(boiled) || rule.test(once)) || BLOCKED_WHOLE.test(boiled) || BLOCKED_WHOLE.test(once);
}

module.exports = { isRude };
