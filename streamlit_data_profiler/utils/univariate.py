import streamlit as st
import pandas as pd
import plotly.express as px

def show_univariate_analysis(df):

    st.subheader("Univariate Analysis")

    column = st.selectbox(
        "Select Column",
        df.columns,
        key="uni_column"
    )

    if pd.api.types.is_numeric_dtype(df[column]):

        # Histogram
        hist_fig = px.histogram(
            df,
            x=column,
            nbins=30,
            title=f"{column} Distribution"
        )

        st.plotly_chart(
            hist_fig,
            use_container_width=True
        )

        # Box Plot
        box_fig = px.box(
            df,
            y=column,
            title=f"{column} Box Plot"
        )

        st.plotly_chart(
            box_fig,
            use_container_width=True
        )

        # Summary Stats
        st.write(df[column].describe())

    else:

        value_counts = (
            df[column]
            .astype(str)
            .value_counts()
            .head(20)
            .reset_index()
        )

        value_counts.columns = [column, "Count"]

        bar_fig = px.bar(
            value_counts,
            x=column,
            y="Count",
            title=f"{column} Top Categories"
        )

        st.plotly_chart(
            bar_fig,
            use_container_width=True
        )