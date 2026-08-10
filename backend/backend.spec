# PyInstaller spec — freezes the FastAPI backend into dist/backend/backend.exe
# Build:  pyinstaller backend.spec --noconfirm   (run from this backend/ folder)

datas = [
    ('Sales Profit Report - By Product Group DEMO 2025-2026.csv', '.'),
    ('users.json', '.'),
    ('agenda/Meeting_Agenda.xlsx', 'agenda'),
    ('../../forecasting/output/forecasts.json', 'forecasting_output'),
    ('../../forecasting/output/top_brands_by_branch.json', 'forecasting_output'),
    ('../../forecasting/output/evaluation_report.json', 'forecasting_output'),
    ('../../datamining/output/seasonal_restock.json', 'datamining_output'),
]

hiddenimports = [
    'uvicorn.logging',
    'uvicorn.loops.auto',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan.on',
    'jose.backends.cryptography_backend',
    'bcrypt',
]

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'mysql', 'mysql.connector', 'gunicorn',
        'torch', 'torchvision', 'torchaudio',
        'cv2', 'opencv',
        'transformers', 'tokenizers', 'huggingface_hub', 'datasets',
        'onnxruntime', 'onnx',
        'av', 'PIL', 'Pillow',
        'matplotlib', 'mpl_toolkits',
        'sklearn', 'sklearn.ensemble',
        'scipy',
        'IPython', 'ipykernel', 'notebook', 'jupyter',
        'tkinter', 'wx', 'gi',
        'pmdarima', 'prophet', 'xgboost', 'lightgbm', 'catboost',
        'tensorflow', 'keras',
        'numba', 'llvmlite',
        'pyarrow', 'pyarrow.pandas_compat',
        'babel',
        'dask', 'distributed', 'bokeh',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='backend',
)
