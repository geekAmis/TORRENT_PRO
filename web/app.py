from flask import Flask, render_template
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/admin')
def admin():
    return render_template('admin.html')

@app.route('/my-profile')
def profile_my():
    return render_template('profil.html')

if __name__ == '__main__':
    app.run(port=5000, debug=True,host="127.0.0.1")