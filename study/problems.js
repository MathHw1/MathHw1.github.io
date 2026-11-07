"use strict";

// Math problem generator for MathHW. Every problem is made fresh, so worksheets and practice
// never run out. A problem looks like:
//   { text, value, answer, tol, steps }
// where value is the exact answer as a number, answer is how to show it, and steps explain it.

const MathHW = (function () {
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const pick = list => list[ri(0, list.length - 1)];
    const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
    const num = n => (n < 0 ? '−' + Math.abs(n) : String(n));
    const par = n => (n < 0 ? '(' + num(n) + ')' : String(n));
    const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    const sup = n => String(n).split('').map(d => SUP[d]).join('');
    const nonZero = (a, b) => { let n = 0; while (n === 0) n = ri(a, b); return n; };

    function frac(n, d) {
        const g = gcd(n, d) || 1;
        const sign = d < 0 ? -1 : 1;
        return { n: sign * n / g, d: sign * d / g };
    }
    const showFrac = f => (f.d === 1 ? num(f.n) : num(f.n) + '/' + f.d);

    function exact(text, value, steps) {
        return { text, value, answer: num(value), steps };
    }
    function fractionAnswer(text, f, steps) {
        return { text, value: f.n / f.d, answer: showFrac(f), steps };
    }

    const topics = {
        fractions: {
            name: 'Fractions', icon: '½', blurb: 'Add, subtract, multiply and divide.',
            make(level) {
                if (level === 'easy') {
                    const d = ri(3, 12), a = ri(1, d - 1), b = ri(1, d - 1), f = frac(a + b, d);
                    return fractionAnswer(`${a}/${d} + ${b}/${d}`, f, [
                        'The bottom numbers match, so just add the top numbers.',
                        `${a} + ${b} = ${a + b}, which gives ${a + b}/${d}.`,
                        `In simplest form, that’s ${showFrac(f)}.`
                    ]);
                }
                if (level === 'medium') {
                    let b = 0, d = 0;
                    while (b === d) { b = pick([2, 3, 4, 5, 6, 8, 10]); d = pick([2, 3, 4, 5, 6, 8, 10]); }
                    const a = ri(1, b - 1), c = ri(1, d - 1), minus = Math.random() < 0.5;
                    const bottom = b * d / gcd(b, d), top1 = a * bottom / b, top2 = c * bottom / d;
                    const top = minus ? top1 - top2 : top1 + top2, f = frac(top, bottom);
                    return fractionAnswer(`${a}/${b} ${minus ? '−' : '+'} ${c}/${d}`, f, [
                        `Find a common bottom number. The smallest one for ${b} and ${d} is ${bottom}.`,
                        `Rewrite them: ${top1}/${bottom} ${minus ? '−' : '+'} ${top2}/${bottom}.`,
                        `Work out the top: ${num(top)}/${bottom}.`,
                        `In simplest form, that’s ${showFrac(f)}.`
                    ]);
                }
                const b = ri(2, 9), d = ri(2, 9), a = ri(1, b + 3), c = ri(1, d + 3), divide = Math.random() < 0.5;
                const f = divide ? frac(a * d, b * c) : frac(a * c, b * d);
                return fractionAnswer(`${a}/${b} ${divide ? '÷' : '×'} ${c}/${d}`, f, divide ? [
                    `To divide by a fraction, flip it and multiply: ${a}/${b} × ${d}/${c}.`,
                    `Multiply straight across: ${a * d}/${b * c}.`,
                    `In simplest form, that’s ${showFrac(f)}.`
                ] : [
                    'Multiply the tops, then multiply the bottoms.',
                    `${a} × ${c} = ${a * c} and ${b} × ${d} = ${b * d}, which gives ${a * c}/${b * d}.`,
                    `In simplest form, that’s ${showFrac(f)}.`
                ]);
            }
        },

        integers: {
            name: 'Integers', icon: '±', blurb: 'Work with positive and negative numbers.',
            make(level) {
                if (level === 'easy') {
                    const a = nonZero(-15, 15), b = nonZero(-15, 15);
                    return exact(`${num(a)} + ${par(b)}`, a + b, [
                        b < 0 ? `Adding a negative is the same as subtracting: ${num(a)} − ${-b}.` : `Start at ${num(a)} and move ${b} to the right.`,
                        `The answer is ${num(a + b)}.`
                    ]);
                }
                if (level === 'medium') {
                    const a = nonZero(-12, 12), b = nonZero(-12, 12);
                    if (Math.random() < 0.5) {
                        return exact(`${num(a)} − ${par(b)}`, a - b, [
                            b < 0 ? `Subtracting a negative is the same as adding: ${num(a)} + ${-b}.` : `Start at ${num(a)} and move ${b} to the left.`,
                            `The answer is ${num(a - b)}.`
                        ]);
                    }
                    return exact(`${par(a)} × ${par(b)}`, a * b, [
                        (a < 0) === (b < 0) ? 'The signs match, so the answer is positive.' : 'The signs are different, so the answer is negative.',
                        `${Math.abs(a)} × ${Math.abs(b)} = ${Math.abs(a * b)}, so the answer is ${num(a * b)}.`
                    ]);
                }
                const a = nonZero(-9, 9), b = nonZero(-9, 9), c = nonZero(-20, 20), v = a * b + c;
                return exact(`${par(a)} × ${par(b)} + ${par(c)}`, v, [
                    `Multiply first: ${par(a)} × ${par(b)} = ${num(a * b)}.`,
                    `Then add: ${num(a * b)} + ${par(c)} = ${num(v)}.`
                ]);
            }
        },

        percents: {
            name: 'Percents', icon: '%', blurb: 'Find percents, discounts and sale prices.',
            make(level) {
                if (level === 'easy') {
                    const p = pick([10, 20, 25, 50, 75]), base = 20 * ri(1, 20), v = base * p / 100;
                    return exact(`What is ${p}% of ${base}?`, v, [
                        `Change the percent to a decimal: ${p}% = ${p / 100}.`,
                        `Multiply: ${p / 100} × ${base} = ${v}.`
                    ]);
                }
                if (level === 'medium') {
                    const y = pick([20, 25, 40, 50, 80, 100, 200]), step = 100 / gcd(y, 100), p = step * ri(1, Math.floor(95 / step));
                    const x = y * p / 100;
                    return { ...exact(`${x} is what percent of ${y}?`, p, [
                        `Divide the part by the whole: ${x} ÷ ${y} = ${p / 100}.`,
                        `Multiply by 100 to get a percent: ${p}%.`
                    ]), answer: p + '%' };
                }
                const price = 20 * ri(1, 15), p = pick([10, 15, 20, 25, 30, 40, 50]), off = price * p / 100, v = price - off;
                return { ...exact(`A $${price} jacket is ${p}% off. What is the sale price?`, v, [
                    `Find the discount: ${p}% of $${price} is $${off}.`,
                    `Subtract it from the price: $${price} − $${off} = $${v}.`
                ]), answer: '$' + v };
            }
        },

        ratios: {
            name: 'Ratios', icon: '∶', blurb: 'Unit rates and proportions.',
            make(level) {
                if (level === 'easy') {
                    const unit = ri(2, 9), n = ri(2, 6), m = ri(3, 12);
                    return { ...exact(`If ${n} notebooks cost $${n * unit}, how much do ${m} notebooks cost?`, m * unit, [
                        `Find the cost of one: $${n * unit} ÷ ${n} = $${unit}.`,
                        `Multiply by ${m}: $${unit} × ${m} = $${m * unit}.`
                    ]), answer: '$' + m * unit };
                }
                if (level === 'medium') {
                    const b = ri(2, 9), a = ri(1, 9), k = ri(2, 8);
                    return exact(`Solve for x: ${a}/${b} = x/${b * k}`, a * k, [
                        `The bottom went from ${b} to ${b * k}, so it was multiplied by ${k}.`,
                        `Do the same to the top: ${a} × ${k} = ${a * k}.`
                    ]);
                }
                const speed = 5 * ri(6, 14), hours = ri(2, 6), more = ri(1, 5), distance = speed * hours;
                return { ...exact(`A car goes ${distance} miles in ${hours} hours. At that speed, how far does it go in ${hours + more} hours?`, speed * (hours + more), [
                    `Find the speed: ${distance} ÷ ${hours} = ${speed} miles per hour.`,
                    `Multiply by the new time: ${speed} × ${hours + more} = ${speed * (hours + more)} miles.`
                ]), answer: speed * (hours + more) + ' miles' };
            }
        },

        equations: {
            name: 'Equations', icon: 'x', blurb: 'Solve for x, step by step.',
            make(level) {
                const x = nonZero(-12, 12);
                if (level === 'easy') {
                    const a = ri(2, 12);
                    if (Math.random() < 0.5) {
                        return exact(`Solve for x: x + ${a} = ${num(x + a)}`, x, [
                            `Subtract ${a} from both sides.`,
                            `x = ${num(x + a)} − ${a} = ${num(x)}.`
                        ]);
                    }
                    return exact(`Solve for x: ${a}x = ${num(a * x)}`, x, [
                        `Divide both sides by ${a}.`,
                        `x = ${num(a * x)} ÷ ${a} = ${num(x)}.`
                    ]);
                }
                if (level === 'medium') {
                    const a = ri(2, 9), b = ri(1, 15), c = a * x + b;
                    return exact(`Solve for x: ${a}x + ${b} = ${num(c)}`, x, [
                        `Subtract ${b} from both sides: ${a}x = ${num(c - b)}.`,
                        `Divide both sides by ${a}: x = ${num(x)}.`
                    ]);
                }
                let a = 0, c = 0;
                while (a === c) { a = ri(2, 9); c = ri(1, 8); }
                if (a < c) [a, c] = [c, a];
                const b = ri(1, 15), d = (a - c) * x + b, xTerm = c === 1 ? 'x' : c + 'x', right = d < 0 ? ` − ${-d}` : d > 0 ? ` + ${d}` : '';
                return exact(`Solve for x: ${a}x + ${b} = ${xTerm}${right}`, x, [
                    `Subtract ${xTerm} from both sides: ${a - c}x + ${b} = ${num(d)}.`,
                    `Subtract ${b} from both sides: ${a - c}x = ${num(d - b)}.`,
                    `Divide both sides by ${a - c}: x = ${num(x)}.`
                ]);
            }
        },

        exponents: {
            name: 'Exponents', icon: 'x²', blurb: 'Powers and square roots.',
            make(level) {
                if (level === 'easy') {
                    const kind = pick(['square', 'square', 'cube', 'two']);
                    if (kind === 'square') {
                        const a = ri(2, 20);
                        return exact(`${a}²`, a * a, [`${a}² means ${a} × ${a}.`, `${a} × ${a} = ${a * a}.`]);
                    }
                    const a = kind === 'cube' ? ri(2, 7) : 2, n = kind === 'cube' ? 3 : ri(4, 10), v = Math.pow(a, n);
                    return exact(`${a}${sup(n)}`, v, [`${a}${sup(n)} means multiplying ${n} ${a}s together.`, `That comes to ${v}.`]);
                }
                if (level === 'medium') {
                    if (Math.random() < 0.25) {
                        const a = ri(2, 6), v = a * a * a;
                        return exact(`∛${v}`, a, [`Ask yourself: what number times itself three times makes ${v}?`, `${a} × ${a} × ${a} = ${v}, so the answer is ${a}.`]);
                    }
                    const a = ri(2, 30);
                    return exact(`√${a * a}`, a, [`Ask yourself: what number times itself makes ${a * a}?`, `${a} × ${a} = ${a * a}, so the answer is ${a}.`]);
                }
                const a = ri(2, 5), n = ri(2, 4), b = ri(2, 9), v = Math.pow(a, n) + b * b;
                return exact(`${a}${sup(n)} + ${b}²`, v, [
                    `Work out each power: ${a}${sup(n)} = ${Math.pow(a, n)} and ${b}² = ${b * b}.`,
                    `Add them: ${Math.pow(a, n)} + ${b * b} = ${v}.`
                ]);
            }
        },

        geometry: {
            name: 'Geometry', icon: '△', blurb: 'Area, perimeter and right triangles.',
            make(level) {
                if (level === 'easy') {
                    const w = ri(2, 20), h = ri(2, 20);
                    if (Math.random() < 0.5) {
                        return exact(`Find the area of a rectangle that is ${w} cm wide and ${h} cm tall.`, w * h, [
                            'Area of a rectangle = width × height.',
                            `${w} × ${h} = ${w * h} square cm.`
                        ]);
                    }
                    return exact(`Find the perimeter of a rectangle that is ${w} cm wide and ${h} cm tall.`, 2 * (w + h), [
                        'Perimeter is the distance around, so add all four sides.',
                        `${w} + ${h} + ${w} + ${h} = ${2 * (w + h)} cm.`
                    ]);
                }
                if (level === 'medium') {
                    const b = 2 * ri(1, 12), h = ri(2, 20);
                    return exact(`Find the area of a triangle with a base of ${b} cm and a height of ${h} cm.`, b * h / 2, [
                        'Area of a triangle = base × height ÷ 2.',
                        `${b} × ${h} ÷ 2 = ${b * h / 2} square cm.`
                    ]);
                }
                const [p, q, r] = pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]), k = ri(1, 6);
                const a = p * k, b = q * k, c = r * k;
                if (Math.random() < 0.5) {
                    return exact(`A right triangle has a longest side of ${c} and one leg of ${a}. How long is the other leg?`, b, [
                        'Use the Pythagorean theorem: a² + b² = c².',
                        `${a}² + b² = ${c}², so b² = ${c * c} − ${a * a} = ${b * b}.`,
                        `The square root of ${b * b} is ${b}.`
                    ]);
                }
                return exact(`A right triangle has legs of ${a} and ${b}. How long is the longest side?`, c, [
                    'Use the Pythagorean theorem: a² + b² = c².',
                    `${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}.`,
                    `The square root of ${c * c} is ${c}.`
                ]);
            }
        },

        order: {
            name: 'Order of Operations', icon: '( )', blurb: 'Solve in the right order with PEMDAS.',
            make(level) {
                if (level === 'easy') {
                    const a = ri(2, 20), b = ri(2, 9), c = ri(2, 9), v = a + b * c;
                    return exact(`${a} + ${b} × ${c}`, v, [`Multiply first: ${b} × ${c} = ${b * c}.`, `Then add: ${a} + ${b * c} = ${v}.`]);
                }
                if (level === 'medium') {
                    const a = ri(2, 12), b = ri(2, 12), c = ri(2, 6), d = ri(1, 20), v = (a + b) * c - d;
                    return exact(`(${a} + ${b}) × ${c} − ${d}`, v, [
                        `Start inside the parentheses: ${a} + ${b} = ${a + b}.`,
                        `Multiply: ${a + b} × ${c} = ${(a + b) * c}.`,
                        `Subtract: ${(a + b) * c} − ${d} = ${v}.`
                    ]);
                }
                const a = ri(2, 6), b = ri(2, 9), c = ri(2, 4), e = ri(2, 6), d = e * ri(2, 6), v = a * (b + c * c) - d / e;
                return exact(`${a} × (${b} + ${c}²) − ${d} ÷ ${e}`, v, [
                    `Do the exponent inside the parentheses: ${c}² = ${c * c}.`,
                    `Finish the parentheses: ${b} + ${c * c} = ${b + c * c}.`,
                    `Multiply and divide: ${a} × ${b + c * c} = ${a * (b + c * c)}, and ${d} ÷ ${e} = ${d / e}.`,
                    `Subtract: ${a * (b + c * c)} − ${d / e} = ${num(v)}.`
                ]);
            }
        }
    };

    // Turns what someone typed into a number. Takes 3/4, 1 1/2, 0.75, x = 4, $12, 25% and 10 cm.
    function parseAnswer(input) {
        const s = String(input).toLowerCase().replace(/−/g, '-').replace(/x\s*=/, '')
            .replace(/[$%,]/g, '').replace(/(square|sq\.?|units?|cm|inches|in|feet|ft|miles?|mi|dollars?|percent)/g, '').trim();
        if (!s) return null;
        const mixed = /^(-?)(\d+)\s+(\d+)\/(\d+)$/.exec(s);
        if (mixed) {
            if (Number(mixed[4]) === 0) return null;
            const size = Number(mixed[2]) + Number(mixed[3]) / Number(mixed[4]);
            return mixed[1] ? -size : size;
        }
        const fraction = /^(-?\d+)\s*\/\s*(-?\d+)$/.exec(s);
        if (fraction) return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
        return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : null;
    }

    // 'right', 'wrong', or 'unreadable' if it isn't a number at all.
    function check(problem, input) {
        const value = parseAnswer(input);
        if (value === null) return 'unreadable';
        return Math.abs(value - problem.value) < 1e-9 ? 'right' : 'wrong';
    }

    const newProblem = (topic, level) => topics[topic].make(level);

    return { topics, newProblem, parseAnswer, check };
})();

if (typeof module !== 'undefined') module.exports = MathHW;
