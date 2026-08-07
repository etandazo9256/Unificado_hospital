/**
 * Comparación: Espera Grupal (Wq⁰ único) vs Individual (Cobham)
 * Parámetros: λ=10.2 | μ=5 | c=5 | a=2.04 | ρ=0.408 | C(c,ρ)=0.064
 */

const C = 5;
const mu = 5;           // pacientes/hora por médico
const lambda = 10.2;    // pacientes/hora total
const a = lambda / mu;  // 2.04
const rho = lambda / (C * mu); // 0.408

// Erlang C
function erlangB(c, a) {
    let sum = 0;
    for (let k = 0; k <= c; k++) sum += Math.pow(a, k) / fact(k);
    return (Math.pow(a, c) / fact(c)) / sum;
}
function fact(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }

const ErlangC = erlangB(C, a) / (1 - rho * (1 - erlangB(C, a)));
const Wq0 = ErlangC / (C * mu - lambda) * 60; // 0.3 min

console.log('=== ENFOQUE GRUPAL (Wq⁰ único) ===');
console.log(`Wq⁰ = ${Wq0.toFixed(1)} min para TODAS las prioridades`);
console.log('→ ROJO: 0.3 min  (debería ser inmediato)');
console.log('→ NARANJA: 0.3 min');
console.log('→ AMARILLO: 0.3 min');
console.log('→ VERDE: 0.3 min');
console.log('→ AZUL: 0.3 min');
console.log('');

console.log('=== ENFOQUE INDIVIDUAL (Cobham) - ACTUAL ===');
// Distribución λ por prioridad (ejemplo realista)
const dist = { ROJO: 0.02, NARANJA: 0.08, AMARILLO: 0.25, VERDE: 0.40, AZUL: 0.25 };
const lambdas = Object.values(dist).map(d => lambda * d);

let ac = 0, sp = 0;
Object.entries(dist).forEach(([prio, d], i) => {
    ac += lambdas[i];
    const sk = ac / (C * mu);
    const denom = (1 - sp) * (1 - sk);
    const Wq_i = (Wq0 / 60) / denom * 60;
    console.log(`→ ${prio}: λ=${lambdas[i].toFixed(2)}, σ=${sk.toFixed(3)}, Wq=${Wq_i.toFixed(1)} min`);
    sp = sk;
});

console.log('');
console.log('=== DIFERENCIA CLAVE ===');
console.log('Grupal:  Todos esperan 0.3 min (ROJO no tiene prioridad real)');
console.log('Individual: ROJO≈0, NARANJA≈0.4, AMARILLO≈0.8, VERDE≈2.1, AZUL≈6.3 min');