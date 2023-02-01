package ai.hash.rustextra.projectView

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.intellij.ui.JBColor
import java.awt.Color

class ModuleFileNode(project: Project, value: PsiFile, viewSettings: ViewSettings) : PsiFileNode(project, value, viewSettings) {

    override fun createPresentation(): PresentationData {
        println("HI!");
        val previous =  super.createPresentation()
        previous.forcedTextForeground = JBColor.GRAY
        previous.background = JBColor.YELLOW;
        previous.presentableText = "../" + previous.presentableText;

        return previous
    }

    override fun getHighlightColor(): Color {
        return JBColor.YELLOW
    }

    override fun getTitle(): String? {
        println("I am getting executed")
        return super.getTitle()
    }

    override fun getWeight(): Int {
        return 0
    }

    companion object {
        fun fromPsiFileNode(node: PsiFileNode) =
                ModuleFileNode(node.project, node.value, node.settings)
    }
}