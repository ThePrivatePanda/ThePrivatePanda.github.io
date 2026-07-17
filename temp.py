from fastapi import FastAPI
from fastapi.responses import FileResponse
import uvicorn

app = FastAPI()


@app.get("/resume", response_class=FileResponse)
async def serve_pdf():
    """
    Serve the PDF file directly to the browser.
    The browser will handle rendering the PDF natively.
    """
    pdf_path = "static/Parth_Mittal_Resume.pdf"  # Path to your PDF file

    return FileResponse(pdf_path, media_type="application/pdf")


if __name__ == "__main__":
    uvicorn.run("temp:app", host="0.0.0.0", port=35535)
