import streamlit as st
import pandas as pd
import zipfile
import math
from io import BytesIO

st.set_page_config(page_title="CSV Splitter Tool", layout="wide")

st.title("📂 CSV Splitter Tool - V2")
st.write(
    "Upload a large CSV file and split it into multiple CSV files without loading the full dataset into memory."
)

# Upload CSV
uploaded_file = st.file_uploader("Upload CSV File", type=["csv"])

# Configurations
max_rows = st.number_input(
    "Maximum rows per split file",
    min_value=1000,
    value=1000000,
    step=1000,
)

chunk_size = st.number_input(
    "Chunk size for processing",
    min_value=10000,
    value=100000,
    step=10000,
)

if uploaded_file is not None:

    try:
        file_size_mb = uploaded_file.size / (1024 * 1024)

        st.info(f"Uploaded file size: {file_size_mb:.2f} MB")

        if st.button("Split CSV"):

            zip_buffer = BytesIO()

            progress_bar = st.progress(0)
            status_text = st.empty()

            rows_processed = 0
            current_file_number = 1
            current_chunk_rows = 0

            temp_df_list = []

            estimated_total_rows = max(
                int((uploaded_file.size / 100) * 2),
                1
            )

            with zipfile.ZipFile(
                zip_buffer,
                mode="w",
                compression=zipfile.ZIP_DEFLATED,
            ) as zip_file:

                csv_iterator = pd.read_csv(
                    uploaded_file,
                    chunksize=chunk_size,
                    low_memory=False,
                )

                for chunk in csv_iterator:

                    temp_df_list.append(chunk)
                    current_chunk_rows += len(chunk)
                    rows_processed += len(chunk)

                    if current_chunk_rows >= max_rows:

                        combined_df = pd.concat(temp_df_list, ignore_index=True)

                        split_df = combined_df.iloc[:max_rows]

                        remainder_df = combined_df.iloc[max_rows:]

                        output_filename = f"split_part_{current_file_number}.csv"

                        csv_bytes = split_df.to_csv(index=False).encode("utf-8")

                        zip_file.writestr(output_filename, csv_bytes)

                        current_file_number += 1

                        temp_df_list = [remainder_df] if not remainder_df.empty else []

                        current_chunk_rows = len(remainder_df)

                    progress = min(rows_processed / estimated_total_rows, 1.0)
                    progress_bar.progress(progress)

                    status_text.text(
                        f"Processed rows: {rows_processed:,}"
                    )

                # Save remaining rows
                if temp_df_list:

                    final_df = pd.concat(temp_df_list, ignore_index=True)

                    if not final_df.empty:

                        original_filename = uploaded_file.name.replace(".csv", "")
                        output_filename = f"{original_filename}_part_{current_file_number}.csv"

                        csv_bytes = final_df.to_csv(index=False).encode("utf-8")

                        zip_file.writestr(output_filename, csv_bytes)

            zip_buffer.seek(0)

            st.success("CSV split completed successfully 🎉")

            st.download_button(
                label="⬇ Download Split CSV ZIP",
                data=zip_buffer,
                file_name=f"{original_filename}_split_files.zip",
                mime="application/zip",
            )

    except Exception as e:
        st.error(f"Error processing file: {e}")

