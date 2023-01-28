package ai.hash.rustextra

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import java.awt.Color

class ModuleFileNode(project: Project, value: PsiFile, viewSettings: ViewSettings) : PsiFileNode(project, value, viewSettings) {
    init {
        println("Hi c:")
        super.myColor = Color.YELLOW;

    }


    override fun getChildrenImpl(): MutableCollection<AbstractTreeNode<*>>? {
        println("HAHAH CHILD TIME")
        return super.getChildrenImpl()
    }

    override fun createPresentation(): PresentationData {
        println("Hello ?")
        return super.createPresentation()
    }

    override fun computeBackgroundColor(): Color? {
        println("HI!")
        return super.computeBackgroundColor()
    }

    override fun getHighlightColor(): Color {
        println("getHighlightColor")
        return super.getHighlightColor()
    }

    override fun update(data: PresentationData) {
        println("Update time ;-;")
        super.update(data)
    }

    override fun updateImpl(data: PresentationData) {
        println("What is up homie?!")
        data.presentableText = "Hello c:"
        super.updateImpl(data)
        data.presentableText = "Hello c:"

        data.background = Color.YELLOW;
    }

    override fun getTitle(): String? {
        println("What is up?");
        return "lmao"
    }

    override fun shouldApply(): Boolean {
        println("shouldApply")
        return super.shouldApply()
    }

    override fun shouldPostprocess(): Boolean {
        println("shouldPostprocess")
        return super.shouldPostprocess()
    }

    override fun shouldUpdateData(): Boolean {
        println("shouldUpdateData");
        return super.shouldUpdateData()
    }

    companion object {
        fun fromPsiFileNode(node: PsiFileNode) =
                ModuleFileNode(node.project, node.value, node.settings)
    }
}