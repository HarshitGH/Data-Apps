import streamlit as st
import pandas as pd
import numpy as np

def show_pivot_analysis(df):

    st.subheader("Pivot Table Analysis")

    row_col = st.selectbox(
        "Select Row",
        df.columns,
        key="pivot_row"
    )

    col_col = st.selectbox(
        "Select Column",
        df.columns,
        key="pivot_col"
    )

    numeric_cols = df.select_dtypes(
        include=np.number
    ).columns.tolist()

    value_options = ["Record Count"] + numeric_cols

    value_col = st.selectbox(
        "Select Value Column",
        value_options,
        key="pivot_value"
    )

    agg_func = st.selectbox(
        "Aggregation",
        [
            "Count",
            "Sum",
            "Mean",
            "Min",
            "Max",
            "% of Row Total",
            "% of Column Total"
        ],
        key="pivot_agg"
    )

    # Decide values parameter
    values_arg = None if value_col == "Record Count" else value_col

    # Aggregation mapping
    agg_mapping = {
        "Count": "size",
        "Sum": "sum",
        "Mean": "mean",
        "Min": "min",
        "Max": "max"
    }

    aggfunc = agg_mapping.get(agg_func, "sum")

    # Create Pivot Table
    pivot_df = pd.pivot_table(
        df,
        index=row_col,
        columns=col_col,
        values=values_arg,
        aggfunc=aggfunc,
        fill_value=0
    )

    # % Row Total
    if agg_func == "% of Row Total":

        pivot_df = pivot_df.div(
            pivot_df.sum(axis=1).replace(0, np.nan),
            axis=0
        ) * 100

    # % Grand Total
    elif agg_func == "% of Column Total":

        pivot_df = pivot_df.div(
        pivot_df.sum(axis=0).replace(0, np.nan),
        axis=1
        ) * 100

    st.dataframe(
        pivot_df,
        use_container_width=True
    )

    csv = pivot_df.to_csv().encode("utf-8")

    st.download_button(
        "Download Pivot CSV",
        csv,
        "pivot_table.csv",
        "text/csv"
    )