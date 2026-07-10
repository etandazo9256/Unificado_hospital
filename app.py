from flask import Flask, render_template, request, redirect, url_for, flash
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime

app = Flask(__name__)
app.secret_key = "clave_secreta_para_alertas" 

DB_HOST = "localhost"  
DB_NAME = "estudiantes" 
DB_USER = "postgres"    
DB_PASSWORD = "Ale02247" 
DB_PORT = "5432"        

def obtener_conexion():
    return psycopg2.connect(host=DB_HOST, database=DB_NAME, user=DB_USER, password=DB_PASSWORD, port=DB_PORT)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/emergencia')
def vista_emergencia():
    return render_template('emergencia.html')

@app.route('/regular')
def vista_regular():
    return render_template('regular.html')

@app.route('/guardar_emergencia', methods=['POST'])
def guardar_emergencia():
    try:
        nombre_paciente = request.form.get('paciente')
        fecha_final = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        conn = obtener_conexion()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO turnos_diarios_emergencia ("FECHA TURNO", "paciente", "turno")
            VALUES (%s, %s, 'EMERGENCIA');
        ''', (fecha_final, nombre_paciente))
        conn.commit()
        cursor.close()
        conn.close()

        flash(f"\n\nPaciente: {nombre_paciente}\nPrioridad: ALTA.\nSerá llamado en aproximadamente 5 minutos en la sala médica.", "emergencia")
        return redirect(url_for('vista_emergencia'))
    except Exception as e:
        return f"Error: {e}"

@app.route('/guardar_regular', methods=['POST'])
def guardar_regular():
    try:
        nombre_paciente = request.form.get('paciente')
        motivo_turno = request.form.get('turno')
        fecha_web = request.form.get('fecha_turno') 
        
        # Procesamos la fecha elegida 
        dt = datetime.strptime(fecha_web, '%Y-%m-%dT%H:%M')
        fecha_bonita = dt.strftime('%d/%m/%Y')
        hora_bonita = dt.strftime('%H:%M')
        fecha_final = dt.strftime('%Y-%m-%d %H:%M:%S')

        conn = obtener_conexion()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO turnos_diarios_emergencia ("FECHA TURNO", "paciente", "turno")
            VALUES (%s, %s, %s);
        ''', (fecha_final, nombre_paciente, motivo_turno))
        conn.commit()
        cursor.close()
        conn.close()

        flash(f"\n\nPaciente: {nombre_paciente}\nFecha de Cita: {fecha_bonita}\nHora asignada: {hora_bonita}\n\nPor favor, llegue 10 minutos antes para ser atendido puntual.", "regular")
        return redirect(url_for('vista_regular'))
    except Exception as e:
        return f"Error: {e}"

if __name__ == '__main__':
    app.run(debug=True)