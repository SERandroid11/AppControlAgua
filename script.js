const firebaseConfig = {
    apiKey: "AIzaSyAhAS4CRIorTY2q1P6jOdVqzxG4xguS6CU",
    authDomain: "controlaguabarrio-e55dd.firebaseapp.com",
    projectId: "controlaguabarrio-e55dd",
    storageBucket: "controlaguabarrio-e55dd.firebasestorage.app",
    messagingSenderId: "854283473411",
    appId: "1:854283473411:web:28bd25590fa2956050f436"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// LÓGICA DE TU BARRIO: Diferencia de lecturas
function calcularMontoMes(lecturaActual, lecturaAnterior) {
    const consumoRealLitros = lecturaActual - lecturaAnterior; 
    const baseGs = 30000;
    const limiteLitros = 30000;
    
    if (consumoRealLitros <= limiteLitros) {
        return baseGs; // Si usó 30.000L o menos, paga el mínimo
    } else {
        const excedenteLitros = consumoRealLitros - limiteLitros;
        // 1.000 Gs por cada 1.000 litros extra
        const montoExcedente = (excedenteLitros / 1000) * 1000; 
        return baseGs + montoExcedente;
    }
}

async function renderizarTablaAdmin() {
    const container = document.getElementById('tabla-container');
    if (!container) return;
    container.innerHTML = "Cargando...";
    const snapshot = await db.collection("vecinos").orderBy("nombre").get();
    let html = `<table><tr><th>Usuario</th><th>Lectura Ant.</th><th>Nueva Lectura</th><th>OK</th></tr>`;
    snapshot.forEach(doc => {
        const v = doc.data();
        const ultima = v.ultima_lectura || 0;
        html += `<tr>
            <td><a href="#" onclick="verDetalleVecino('${doc.id}')" class="link-vecino">${v.nombre}</a></td>
            <td>${ultima}</td>
            <td><input type="number" id="quick-act-${doc.id}" style="width:80px" placeholder="0"></td>
            <td><button onclick="guardarLecturaMensual('${doc.id}', ${ultima})" class="btn-primary">OK</button></td>
        </tr>`;
    });
    container.innerHTML = html + "</table>";
}

async function guardarLecturaMensual(id, anterior) {
    const input = document.getElementById(`quick-act-${id}`);
    const actual = parseFloat(input.value);
    const mes = document.getElementById('mes-global-selector').value;
    
    if (isNaN(actual) || actual <= anterior) {
        return alert("Error: La lectura debe ser mayor a la anterior (" + anterior + ")");
    }

    const monto = calcularMontoMes(actual, anterior);
    const consumoRealMes = actual - anterior;

    try {
        await db.collection("lecturas_mensuales").add({ 
            id_medidor: id, 
            mes: mes, 
            lectura: actual, 
            consumo_litros: consumoRealMes, 
            monto: monto, 
            estado: "Pendiente"
        });
        
        const vRef = db.collection("vecinos").doc(id);
        const vDoc = await vRef.get();
        const deudaPrevia = vDoc.data().monto_pendiente || 0;

        await vRef.update({ 
            ultima_lectura: actual, 
            monto_pendiente: deudaPrevia + monto 
        });
        
        alert(`¡Guardado! Consumo: ${consumoRealMes}L. Monto: ${monto} Gs`);
        input.value = ""; 
        renderizarTablaAdmin();
    } catch (e) { alert("Error al guardar."); }
}

async function verDetalleVecino(id) {
    // Ocultar lista y formulario de registro
    document.getElementById('vista-lista-general').style.display = 'none';
    document.getElementById('seccion-registro').style.display = 'none';
    
    const vistaDetalle = document.getElementById('vista-detalle-vecino');
    vistaDetalle.style.display = 'block';

    const vDoc = await db.collection("vecinos").doc(id).get();
    document.getElementById('det-nombre').innerText = vDoc.data().nombre;
    document.getElementById('det-id').innerText = id;

    const lecturas = await db.collection("lecturas_mensuales").where("id_medidor", "==", id).get();
    const mesesData = {};
    lecturas.forEach(doc => { mesesData[doc.data().mes.toUpperCase()] = { ...doc.data(), docId: doc.id }; });

    const mesesAnio = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
    let html = `<table><tr><th>MES</th><th>MONTO</th><th>ESTADO</th><th>ACCIÓN</th></tr>`;

    mesesAnio.forEach(mes => {
        const data = mesesData[mes];
        if (data) {
            const isPagado = data.estado === "Pagado";
            html += `<tr>
                <td>${mes}</td>
                <td>${(data.monto || 0).toLocaleString()}</td>
                <td><span class="${isPagado ? 'estado-pagado' : 'estado-pendiente'}">${data.estado}</span></td>
                <td>${!isPagado ? `<button onclick="marcarPagadoMes('${data.docId}', '${id}', ${data.monto})">Cobrar</button>` : '✅'}</td>
            </tr>`;
        } else {
            html += `<tr><td>${mes}</td><td>-</td><td><span class="estado-sin-lectura">SIN LECTURA</span></td><td>-</td></tr>`;
        }
    });
    document.getElementById('tabla-detalle-historial').innerHTML = html + "</table>";
}

async function marcarPagadoMes(docId, vecinoId, monto) {
    await db.collection("lecturas_mensuales").doc(docId).update({ estado: "Pagado" });
    const vRef = db.collection("vecinos").doc(vecinoId);
    const vDoc = await vRef.get();
    const deudaActual = vDoc.data().monto_pendiente || 0;
    await vRef.update({ monto_pendiente: Math.max(0, deudaActual - monto) });
    alert("Pago registrado"); 
    verDetalleVecino(vecinoId);
}

function volverALista() {
    document.getElementById('vista-detalle-vecino').style.display = 'none';
    document.getElementById('vista-lista-general').style.display = 'block';
    document.getElementById('seccion-registro').style.display = 'block';
    renderizarTablaAdmin();
}

async function consultarHistorialCompleto() {
    const id = document.getElementById('busqueda-id').value;
    const resDiv = document.getElementById('resultado-historial');
    const cuerpo = document.getElementById('cuerpo-historial');
    if (!id) return alert("Ingresa un ID");

    const vDoc = await db.collection("vecinos").doc(id).get();
    if (!vDoc.exists) return alert("ID no encontrado");

    document.getElementById('nombre-vecino-cabecera').innerText = vDoc.data().nombre;
    resDiv.style.display = "block";

    const lecturas = await db.collection("lecturas_mensuales").where("id_medidor", "==", id).get();
    const mesesData = {};
    lecturas.forEach(l => { mesesData[l.data().mes.toUpperCase()] = l.data(); });

    const mesesAnio = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
    let html = "";
    mesesAnio.forEach(mes => {
        const d = mesesData[mes];
        if (d) {
            html += `<tr><td>${mes}</td><td>${(d.monto || 0).toLocaleString()} Gs</td><td>${(d.consumo_litros || 0).toLocaleString()} L</td><td><span class="${d.estado === 'Pagado' ? 'estado-pagado' : 'estado-pendiente'}">${d.estado}</span></td></tr>`;
        } else {
            html += `<tr><td>${mes}</td><td>-</td><td>-</td><td><span class="estado-sin-lectura">SIN LECTURA</span></td></tr>`;
        }
    });
    cuerpo.innerHTML = html;
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

function loginAdmin() {
    if (prompt("Clave de Admin:") === "1234") {
        showTab('admin-tab');
        renderizarTablaAdmin();
    } else alert("Error");
}

async function crearNuevoVecino() {
    const id = document.getElementById('new-id').value;
    const nombre = document.getElementById('new-nombre').value;
    const lectura = parseFloat(document.getElementById('new-lectura').value) || 0;
    if (!id || !nombre) return alert("Faltan datos");
    await db.collection("vecinos").doc(id).set({ nombre, ultima_lectura: lectura, monto_pendiente: 0 });
    alert("Creado"); 
    renderizarTablaAdmin();
}