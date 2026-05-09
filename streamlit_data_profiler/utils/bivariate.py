import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go


def cramers_v(x, y):

    table = pd.crosstab(x, y)

    if table.empty:
        return np.nan

    observed = table.to_numpy(dtype=float)

    row_sums = observed.sum(axis=1, keepdims=True)
    col_sums = observed.sum(axis=0, keepdims=True)

    total = observed.sum()

    expected = row_sums @ col_sums / total

    with np.errstate(divide="ignore", invalid="ignore"):

        chi2 = np.nansum(
            (observed - expected) ** 2 / expected
        )

    n = observed.sum()

    phi2 = chi2 / n

    r, k = observed.shape

    denom = min(k - 1, r - 1)

    if denom == 0:
        return np.nan

    return np.sqrt(phi2 / denom)


def show_bivariate_analysis(df):

    st.subheader("Bivariate Analysis")

    all_columns = df.columns.tolist()

    x_col = st.selectbox(
        "Select X Column",
        all_columns,
        key="bi_x"
    )

    y_col = st.selectbox(
        "Select Y Column",
        all_columns,
        key="bi_y"
    )

    chart_type = st.radio(
        "Chart Type",
        [
            "Auto",
            "Scatter",
            "Line",
            "Bar",
            "Box",
            "Heatmap"
        ],
        horizontal=True
    )

    x_numeric = pd.api.types.is_numeric_dtype(df[x_col])
    y_numeric = pd.api.types.is_numeric_dtype(df[y_col])

    # AUTO DETECTION
    if chart_type == "Auto":

        if x_numeric and y_numeric:
            chart_type = "Scatter"

        elif x_numeric or y_numeric:
            chart_type = "Box"

        else:
            chart_type = "Heatmap"

    # SCATTER
    if chart_type == "Scatter" and x_numeric and y_numeric:

        clean_df = df[
            [x_col, y_col]
        ].dropna()

        fig = px.scatter(
            clean_df,
            x=x_col,
            y=y_col,
            opacity=0.7,
            title=f"{x_col} vs {y_col}"
        )

        # Regression Line
        if (
            len(clean_df) >= 2
            and clean_df[x_col].nunique() > 1
        ):

            slope, intercept = np.polyfit(
                clean_df[x_col],
                clean_df[y_col],
                1
            )

            x_line = np.linspace(
                clean_df[x_col].min(),
                clean_df[x_col].max(),
                100
            )

            y_line = (
                slope * x_line
            ) + intercept

            fig.add_trace(
                go.Scatter(
                    x=x_line,
                    y=y_line,
                    mode="lines",
                    name="Regression Line"
                )
            )

        st.plotly_chart(
            fig,
            use_container_width=True
        )

        st.write({
            "Correlation":
                clean_df[x_col].corr(
                    clean_df[y_col]
                ),

            "Covariance":
                clean_df[x_col].cov(
                    clean_df[y_col]
                ),

            "Usable Rows":
                len(clean_df)
        })

    # LINE CHART
    elif (
        chart_type == "Line"
        and x_numeric
        and y_numeric
    ):

        temp_df = (
            df[[x_col, y_col]]
            .dropna()
            .sort_values(x_col)
        )

        fig = px.line(
            temp_df,
            x=x_col,
            y=y_col,
            title=f"{y_col} by {x_col}"
        )

        st.plotly_chart(
            fig,
            use_container_width=True
        )

    # BOX PLOT
    elif (
        chart_type == "Box"
        and (x_numeric or y_numeric)
    ):

        category_col = y_col if x_numeric else x_col

        measure_col = x_col if x_numeric else y_col

        temp_df = df[
            [category_col, measure_col]
        ].dropna()

        top_categories = (
            temp_df[category_col]
            .astype(str)
            .value_counts()
            .head(30)
            .index
        )

        temp_df = temp_df[
            temp_df[category_col]
            .astype(str)
            .isin(top_categories)
        ]

        fig = px.box(
            temp_df,
            x=category_col,
            y=measure_col,
            points="outliers",
            title=f"{measure_col} by {category_col}"
        )

        st.plotly_chart(
            fig,
            use_container_width=True
        )

    # BAR CHART
    elif (
        chart_type == "Bar"
        and (x_numeric or y_numeric)
    ):

        category_col = y_col if x_numeric else x_col

        measure_col = x_col if x_numeric else y_col

        temp_df = df[
            [category_col, measure_col]
        ].dropna()

        grouped_df = (
            temp_df
            .groupby(category_col)[measure_col]
            .mean()
            .sort_values(ascending=False)
            .head(30)
            .reset_index()
        )

        fig = px.bar(
            grouped_df,
            x=category_col,
            y=measure_col,
            title=f"Average {measure_col} by {category_col}"
        )

        st.plotly_chart(
            fig,
            use_container_width=True
        )

    # HEATMAP
    else:

        crosstab = pd.crosstab(
            df[x_col].astype(str),
            df[y_col].astype(str)
        )

        crosstab = crosstab.iloc[:30, :30]

        fig = px.imshow(
            crosstab,
            text_auto=True,
            aspect="auto",
            title=f"{x_col} vs {y_col}"
        )

        st.plotly_chart(
            fig,
            use_container_width=True
        )

        cramers = cramers_v(
            df[x_col],
            df[y_col]
        )

        st.metric(
            "Cramer's V",
            round(cramers, 3)
            if not np.isnan(cramers)
            else "N/A"
        )