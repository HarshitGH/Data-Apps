import streamlit as st

def show_overview(df):

    st.subheader("Dataset Overview")

    col1, col2, col3, col4 = st.columns(4)

    col1.metric("Rows", df.shape[0])
    col2.metric("Columns", df.shape[1])
    col3.metric(
        "Missing Values",
        df.isnull().sum().sum()
    )
    col4.metric(
        "Duplicate Rows",
        df.duplicated().sum()
    )

    st.write("### Data Preview")

    st.dataframe(df.head())