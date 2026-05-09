import streamlit as st
import pandas as pd
import plotly.express as px


def show_correlation(df):

    st.subheader("Correlation Analysis")

    numeric_df = df.select_dtypes(include='number')

    if numeric_df.shape[1] < 2:
        st.warning("Need at least 2 numeric columns for correlation analysis.")
        return

    # -----------------------------
    # Correlation Heatmap
    # -----------------------------

    st.write("### Correlation Heatmap")

    corr_matrix = numeric_df.corr()

    heatmap_fig = px.imshow(
        corr_matrix,
        text_auto=True,
        aspect="auto",
        color_continuous_scale="RdBu_r"
    )

    st.plotly_chart(
        heatmap_fig,
        use_container_width=True
    )

    st.divider()

    # -----------------------------
    # Correlation Funnel
    # -----------------------------

    st.write("### Correlation Funnel")

    selected_target = st.selectbox(
        "Select Target Column",
        numeric_df.columns
    )

    corr_target = (
        corr_matrix[selected_target]
        .drop(selected_target)
        .sort_values(key=abs, ascending=False)
    )

    funnel_df = pd.DataFrame({
        "Feature": corr_target.index,
        "Correlation": corr_target.values,
        "Abs Correlation": abs(corr_target.values)
    })

    funnel_fig = px.funnel(
        funnel_df,
        y="Feature",
        x="Abs Correlation",
        color="Correlation"
    )

    funnel_fig.update_traces(
        marker=dict(
            color=funnel_df["Correlation"],
            colorscale="RdBu",
            showscale=True
        )
    )

    funnel_fig.update_layout(
        height=600,
        xaxis_title="Absolute Correlation Strength",
        yaxis_title="Features"
    )

    st.plotly_chart(
        funnel_fig,
        use_container_width=True
    )

    # -----------------------------
    # Correlation Table
    # -----------------------------

    st.write("### Correlation Values")

    st.dataframe(
        funnel_df,
        use_container_width=True
    )

