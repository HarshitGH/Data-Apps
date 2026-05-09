import streamlit as st
import pandas as pd

from utils.overview import show_overview
# from utils.missing import show_missing_analysis
# from utils.numeric import show_numeric_analysis
from utils.correlation import show_correlation

# NEW IMPORTS
from utils.univariate import show_univariate_analysis
from utils.bivariate import show_bivariate_analysis
from utils.pivot import show_pivot_analysis

st.set_page_config(
    page_title="Data Profiling Tool",
    layout="wide"
)

st.title("📊 HData Profiler Tool")

uploaded_file = st.file_uploader(
    "Upload CSV File",
    type=["csv"]
)

if uploaded_file:

    df = pd.read_csv(uploaded_file)

    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "Overview",
        "Univariate Analysis",
        "Bivariate Analysis",
        "Correlation",
        "Pivot Tables"
    ])

    with tab1:
        show_overview(df)

    with tab2:
        show_univariate_analysis(df)

    with tab3:
        show_bivariate_analysis(df)

    with tab4:
        show_correlation(df)

    with tab5:
        show_pivot_analysis(df)
